import {config} from "../../config.js";
import {GetDataFn, PaginationConfig} from "../../types/types.synchronizerData.js";
import {createGiteaApi, GiteaPullRequest} from "../../api/gitea.js";
import {idsOf, issueKey} from "../../utils/data.js";
import {paginateRepoScoped, RepoContext} from "./helpers.js";

export const transformPullRequest = (pr: GiteaPullRequest, repoFullName: string) => ({
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
  head_branch: pr.head?.ref,
  diff_url: pr.diff_url,
  comments_count: pr.comments,
  due_date: pr.due_date ?? undefined,
  created_at: pr.created_at,
  updated_at: pr.updated_at,
  closed_at: pr.closed_at ?? undefined,
  repository_id: repoFullName,
  author_id: pr.user ? String(pr.user.id) : undefined,
  assignee_ids: idsOf(pr.assignees),
  reviewer_ids: idsOf(pr.requested_reviewers),
  label_ids: idsOf(pr.labels),
  milestone_id: pr.milestone ? String(pr.milestone.id) : undefined,
});

/**
 * Pull requests are delta-synced through the issues endpoint (`type=pulls`,
 * which is the only PR listing that supports `since`), then each one is enriched
 * with a single `/pulls/{index}` call to obtain merge/branch metadata.
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
      const pulls = await Promise.all(list.map((i) => gitea.getPullRequest(ctx.owner, ctx.repo, i.number)));
      return {items: pulls.map((pr) => transformPullRequest(pr, ctx.repoFullName)), hasNext};
    },
  });
};
