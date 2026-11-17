import {config} from "../../config.js";
import {GetDataFn, PaginationConfig} from "../../types/types.synchronizerData.js";
import {createGiteaApi, GiteaApi, GiteaCombinedStatus, GiteaPullRequest, GiteaPullReview} from "../../api/gitea.js";
import {idsOf, issueKey} from "../../utils/data.js";
import {paginateRepoScoped, RepoContext} from "./helpers.js";

export type ReviewState = "Approved" | "Changes requested" | "Pending";
export type CiStatus = "Success" | "Pending" | "Failure" | "None";

export type ReviewerPartition = {
  /** Users whose latest effective decision is an approval. */
  approved: string[];
  /** Users whose latest effective decision is a change request. */
  changesRequested: string[];
  /** Overall decision: any change request wins, then approvals, else still pending. */
  reviewState: ReviewState;
  /** Users whose review is still pending (an open review request). */
  requested: string[];
  /** Users who have actually submitted a review (approve/changes/comment). */
  reviewed: string[];
};

/**
 * Splits a PR's reviewers into those still-requested and those who have reviewed.
 *
 * Gitea's `pr.requested_reviewers` is misleading: it contains every user with a
 * non-dismissed review of ANY type — approve, request-changes, comment, or
 * request — i.e. everyone who reviewed OR was asked to, not just open requests.
 * Mapping it straight into the "Requested Reviewers" relation marks people who
 * already reviewed (and now only show as participants) as still-requested.
 *
 * The review history endpoint is authoritative: we keep each user's latest review
 * row and bucket them by its state. Gitea deletes the request row once a user
 * acts, so the latest row reflects their current state — a user is therefore in
 * exactly one bucket. REQUEST_REVIEW is a pending request; APPROVED /
 * REQUEST_CHANGES / COMMENT mean they reviewed. PENDING (unsubmitted draft) and
 * team review requests (null `user`) are ignored.
 */
export const partitionReviewers = (reviews: GiteaPullReview[]): ReviewerPartition => {
  const latestByUser = new Map<number, GiteaPullReview>();
  for (const review of reviews) {
    const userId = review.user?.id;
    if (userId == null) {
      continue;
    }
    const current = latestByUser.get(userId);
    if (!current || review.id > current.id) {
      latestByUser.set(userId, review);
    }
  }

  // Decisions are tracked separately from the latest row: a later plain COMMENT
  // must not erase an earlier approval. Dismissed reviews no longer count.
  const decisionByUser = new Map<number, GiteaPullReview>();
  for (const review of reviews) {
    const userId = review.user?.id;
    if (userId == null || review.dismissed) {
      continue;
    }
    if (review.state !== "APPROVED" && review.state !== "REQUEST_CHANGES") {
      continue;
    }
    const current = decisionByUser.get(userId);
    if (!current || review.id > current.id) {
      decisionByUser.set(userId, review);
    }
  }
  const approved: string[] = [];
  const changesRequested: string[] = [];
  for (const [userId, review] of decisionByUser) {
    (review.state === "APPROVED" ? approved : changesRequested).push(String(userId));
  }
  const reviewState: ReviewState =
    changesRequested.length > 0 ? "Changes requested" : approved.length > 0 ? "Approved" : "Pending";

  const requested: string[] = [];
  const reviewed: string[] = [];
  for (const [userId, review] of latestByUser) {
    if (review.state === "REQUEST_REVIEW") {
      if (!review.dismissed) {
        requested.push(String(userId));
      }
    } else if (review.state === "APPROVED" || review.state === "REQUEST_CHANGES" || review.state === "COMMENT") {
      reviewed.push(String(userId));
    }
  }
  return {requested, reviewed, approved, changesRequested, reviewState};
};

/**
 * Once the head branch is deleted Gitea reports `head.ref` as `refs/pull/<n>/head`,
 * while `head.label` keeps the branch name (`branch`, or `owner:branch` for a fork;
 * git ref names cannot contain ":"). Falls back to `head.ref` unless that is the
 * synthetic pull ref.
 */
export const headBranchOf = (pr: GiteaPullRequest): string | undefined => {
  const label = pr.head?.label?.trim();
  if (label) {
    return label.slice(label.lastIndexOf(":") + 1);
  }
  const ref = pr.head?.ref;
  return ref && !ref.startsWith("refs/pull/") ? ref : undefined;
};

export const ciStatusOf = (status: GiteaCombinedStatus | null): CiStatus => {
  if (!status || !status.total_count) {
    return "None";
  }
  switch (status.state) {
    case "success":
      return "Success";
    case "failure":
    case "error":
    case "warning":
      return "Failure";
    default:
      return "Pending";
  }
};

export const transformPullRequest = (
  pr: GiteaPullRequest,
  repoFullName: string,
  reviewers: ReviewerPartition,
  ciStatus: CiStatus = "None",
) => ({
  id: issueKey(repoFullName, pr.number),
  name: pr.title,
  number: pr.number,
  state: pr.merged ? "Merged" : pr.state === "closed" ? "Closed" : "Open",
  body: pr.body,
  html_url: pr.html_url,
  merged: pr.merged,
  merged_at: pr.merged_at ?? undefined,
  mergeable: pr.mergeable,
  merge_commit_sha: pr.merge_commit_sha,
  base_branch: pr.base?.ref,
  head_branch: headBranchOf(pr),
  diff_url: pr.diff_url,
  comments_count: pr.comments,
  additions: pr.additions,
  deletions: pr.deletions,
  changed_files: pr.changed_files,
  created_at: pr.created_at,
  updated_at: pr.updated_at,
  closed_at: pr.closed_at ?? undefined,
  repository_id: repoFullName,
  author_id: pr.user ? String(pr.user.id) : undefined,
  assignee_ids: idsOf(pr.assignees),
  reviewer_ids: reviewers.requested,
  reviewed_by_ids: reviewers.reviewed,
  approved_by_ids: reviewers.approved,
  changes_requested_by_ids: reviewers.changesRequested,
  review_state: reviewers.reviewState,
  ci_status: ciStatus,
  label_ids: idsOf(pr.labels),
  milestone_id: pr.milestone ? String(pr.milestone.id) : undefined,
});

/** Fetches a PR with everything needed to build its Fibery row (detail, reviews, CI status). */
export const fetchPullRequest = async (
  gitea: GiteaApi,
  owner: string,
  repo: string,
  repoFullName: string,
  number: number,
) => {
  const [pr, reviews] = await Promise.all([
    gitea.getPullRequest(owner, repo, number),
    gitea.getPullReviews(owner, repo, number),
  ]);
  const status = pr.head?.sha ? await gitea.getCommitStatus(owner, repo, pr.head.sha) : null;
  return transformPullRequest(pr, repoFullName, partitionReviewers(reviews), ciStatusOf(status));
};

/**
 * Pull requests are delta-synced through the issues endpoint (`type=pulls`,
 * which is the only PR listing that supports `since`), then each one is enriched
 * with a `/pulls/{index}` call for merge/branch metadata and a
 * `/pulls/{index}/reviews` call to resolve the pending review requests.
 */
export const getPullRequests: GetDataFn<ReturnType<typeof transformPullRequest>, PaginationConfig> = async ({
  account,
  filter,
  pagination,
  lastSynchronizedAt,
}) => {
  const gitea = createGiteaApi(account);

  return paginateRepoScoped({
    account,
    filter,
    pagination,
    lastSynchronizedAt,
    supportsDelta: true,
    fetchPage: async (ctx: RepoContext, page, since) => {
      const {list, hasNext} = await gitea.getIssues({
        owner: ctx.owner,
        repo: ctx.repo,
        page,
        limit: config.pageSize,
        type: "pulls",
        since,
      });
      const items = await Promise.all(
        list.map((i) => fetchPullRequest(gitea, ctx.owner, ctx.repo, ctx.repoFullName, i.number)),
      );
      return {items, hasNext};
    },
  });
};
