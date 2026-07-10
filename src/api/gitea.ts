import pLimit from "p-limit";
import {AppError} from "../errors/errors.js";
import {config} from "../config.js";
import {IntegrationAccount} from "../types/types.authentication.js";

const limit = pLimit(config.maxConcurrentConnections);

export type GiteaUser = {
  id: number;
  login: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  created?: string;
  is_admin?: boolean;
};

export type GiteaRepository = {
  id: number;
  name: string;
  full_name: string;
  owner?: GiteaUser;
  description?: string;
  private?: boolean;
  fork?: boolean;
  archived?: boolean;
  mirror?: boolean;
  empty?: boolean;
  default_branch?: string;
  html_url?: string;
  clone_url?: string;
  ssh_url?: string;
  website?: string;
  stars_count?: number;
  forks_count?: number;
  watchers_count?: number;
  open_issues_count?: number;
  size?: number;
  has_issues?: boolean;
  has_wiki?: boolean;
  has_pull_requests?: boolean;
  language?: string;
  created_at?: string;
  updated_at?: string;
};

export type GiteaLabel = {
  id: number;
  name: string;
  description?: string;
  color?: string;
  exclusive?: boolean;
  url?: string;
};

export type GiteaMilestone = {
  id: number;
  title: string;
  description?: string;
  state?: string;
  open_issues?: number;
  closed_issues?: number;
  due_on?: string;
  closed_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type GiteaPullRequestMeta = {
  merged?: boolean;
  merged_at?: string;
};

export type GiteaIssue = {
  id: number;
  number: number;
  title: string;
  body?: string;
  state?: string;
  html_url?: string;
  user?: GiteaUser;
  labels?: GiteaLabel[];
  assignee?: GiteaUser;
  assignees?: GiteaUser[];
  milestone?: GiteaMilestone;
  comments?: number;
  is_locked?: boolean;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  pull_request?: GiteaPullRequestMeta | null;
};

export type GiteaBranchInfo = {
  label?: string;
  ref?: string;
  sha?: string;
  repo?: GiteaRepository;
};

export type GiteaPullRequest = {
  id: number;
  number: number;
  title: string;
  body?: string;
  state?: string;
  html_url?: string;
  user?: GiteaUser;
  labels?: GiteaLabel[];
  assignee?: GiteaUser;
  assignees?: GiteaUser[];
  requested_reviewers?: GiteaUser[];
  milestone?: GiteaMilestone;
  comments?: number;
  merged?: boolean;
  merged_at?: string;
  merged_by?: GiteaUser;
  mergeable?: boolean;
  merge_commit_sha?: string;
  base?: GiteaBranchInfo;
  head?: GiteaBranchInfo;
  diff_url?: string;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
};

/**
 * A single review row from `/pulls/{index}/reviews`. Gitea returns the full
 * history (one row per review event), not one row per reviewer, so callers must
 * dedupe to the latest row per user themselves.
 *
 * `state` values: APPROVED, PENDING, COMMENT, REQUEST_CHANGES, REQUEST_REVIEW.
 * Only REQUEST_REVIEW represents a still-pending review request. Team review
 * requests come back with `user` null and a `team` set — we ignore those here.
 */
export type GiteaPullReviewState =
  | "APPROVED"
  | "PENDING"
  | "COMMENT"
  | "REQUEST_CHANGES"
  | "REQUEST_REVIEW"
  | "";

export type GiteaPullReview = {
  id: number;
  user?: GiteaUser | null;
  state?: GiteaPullReviewState;
  dismissed?: boolean;
  submitted_at?: string;
};

export type GiteaComment = {
  id: number;
  html_url?: string;
  issue_url?: string;
  pull_request_url?: string;
  user?: GiteaUser;
  body?: string;
  created_at?: string;
  updated_at?: string;
};

type ListResult<T> = {
  list: T[];
  hasNext: boolean;
};

const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  // Allow the user to pass a URL that already ends with /api/v1
  return withScheme.replace(/\/api\/v1$/i, "");
};

export const createGiteaApi = (account: IntegrationAccount) => {
  const apiRoot = `${normalizeBaseUrl(account.baseUrl)}/api/v1`;

  const request = async <T>(
    path: string,
    searchParams: Record<string, string | number | undefined> = {},
  ): Promise<{data: T; totalCount?: number}> => {
    const url = new URL(`${apiRoot}${path}`);
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    return limit(async () => {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Authorization: `token ${account.apiKey}`,
            Accept: "application/json",
          },
        });
      } catch (e) {
        throw new AppError({
          statusCode: 502,
          message: `Unable to reach Gitea instance: ${(e as Error).message}`,
          tryLater: true,
        });
      }

      if (!response.ok) {
        let message = `Gitea API request failed with status ${response.status}`;
        try {
          const body = (await response.json()) as {message?: string};
          if (body?.message) {
            message = body.message;
          }
        } catch {
          // response has no JSON body
        }
        throw new AppError({
          statusCode: response.status,
          message,
          tryLater: response.status === 429 || response.status >= 500,
        });
      }

      const totalCountHeader = response.headers.get("x-total-count");
      const data = (await response.json()) as T;
      return {
        data,
        totalCount: totalCountHeader === null ? undefined : Number(totalCountHeader),
      };
    });
  };

  const listRequest = async <T>(
    path: string,
    {page, limit: pageSize, ...rest}: {page: number; limit: number; [key: string]: string | number | undefined},
  ): Promise<ListResult<T>> => {
    const {data, totalCount} = await request<T[]>(path, {page, limit: pageSize, ...rest});
    const list = Array.isArray(data) ? data : [];
    const hasNext =
      totalCount !== undefined && !Number.isNaN(totalCount) ? page * pageSize < totalCount : list.length === pageSize;
    return {list, hasNext};
  };

  const validate = async (): Promise<GiteaUser> => {
    const {data} = await request<GiteaUser>(`/user`);
    return data;
  };

  const getAccessibleRepositories = ({page, limit: pageSize}: {page: number; limit: number}) =>
    listRequest<GiteaRepository>(`/user/repos`, {page, limit: pageSize});

  const getRepository = async (owner: string, repo: string): Promise<GiteaRepository> => {
    const {data} = await request<GiteaRepository>(`/repos/${owner}/${repo}`);
    return data;
  };

  const getIssues = ({
    owner,
    repo,
    page,
    limit: pageSize,
    type,
    since,
  }: {
    owner: string;
    repo: string;
    page: number;
    limit: number;
    type: "issues" | "pulls";
    since?: string;
  }) =>
    listRequest<GiteaIssue>(`/repos/${owner}/${repo}/issues`, {
      page,
      limit: pageSize,
      type,
      state: "all",
      since,
    });

  const getPullRequest = async (owner: string, repo: string, index: number): Promise<GiteaPullRequest> => {
    const {data} = await request<GiteaPullRequest>(`/repos/${owner}/${repo}/pulls/${index}`);
    return data;
  };

  // Full review history for a PR. Paginates to completion because we need every
  // reviewer's latest state to tell pending requests apart from completed reviews.
  const getPullReviews = async (owner: string, repo: string, index: number): Promise<GiteaPullReview[]> => {
    const all: GiteaPullReview[] = [];
    let page = 1;
    for (;;) {
      const {list, hasNext} = await listRequest<GiteaPullReview>(`/repos/${owner}/${repo}/pulls/${index}/reviews`, {
        page,
        limit: config.pageSize,
      });
      all.push(...list);
      if (!hasNext || list.length === 0) {
        break;
      }
      page += 1;
    }
    return all;
  };

  const getMilestones = ({owner, repo, page, limit: pageSize}: {owner: string; repo: string; page: number; limit: number}) =>
    listRequest<GiteaMilestone>(`/repos/${owner}/${repo}/milestones`, {page, limit: pageSize, state: "all"});

  const getLabels = ({owner, repo, page, limit: pageSize}: {owner: string; repo: string; page: number; limit: number}) =>
    listRequest<GiteaLabel>(`/repos/${owner}/${repo}/labels`, {page, limit: pageSize});

  const getComments = ({
    owner,
    repo,
    page,
    limit: pageSize,
    since,
  }: {
    owner: string;
    repo: string;
    page: number;
    limit: number;
    since?: string;
  }) => listRequest<GiteaComment>(`/repos/${owner}/${repo}/issues/comments`, {page, limit: pageSize, since});

  const getCollaborators = ({
    owner,
    repo,
    page,
    limit: pageSize,
  }: {
    owner: string;
    repo: string;
    page: number;
    limit: number;
  }) => listRequest<GiteaUser>(`/repos/${owner}/${repo}/collaborators`, {page, limit: pageSize});

  // Users assignable to issues/PRs in the repo — includes org members with write
  // access, which `collaborators` (direct-only) misses for team-based orgs.
  const getAssignees = async ({owner, repo}: {owner: string; repo: string}): Promise<GiteaUser[]> => {
    try {
      const {data} = await request<GiteaUser[]>(`/repos/${owner}/${repo}/assignees`);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      // Some repositories (e.g. with issues disabled) return 404 here; treat as no assignees.
      if (e instanceof AppError && e.statusCode === 404) {
        return [];
      }
      throw e;
    }
  };

  return {
    validate,
    getAccessibleRepositories,
    getRepository,
    getIssues,
    getPullRequest,
    getPullReviews,
    getMilestones,
    getLabels,
    getComments,
    getCollaborators,
    getAssignees,
  };
};

export type GiteaApi = ReturnType<typeof createGiteaApi>;
