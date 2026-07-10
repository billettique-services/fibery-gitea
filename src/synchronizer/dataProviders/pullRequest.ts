import {config} from "../../config.js";
import {GetDataFn, PaginationConfig} from "../../types/types.synchronizerData.js";
import {createGiteaApi, GiteaPullRequest, GiteaPullReview} from "../../api/gitea.js";
import {idsOf, issueKey} from "../../utils/data.js";
import {paginateRepoScoped, RepoContext} from "./helpers.js";

export type ReviewerPartition = {
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

  const requested: string[] = [];
  const reviewed: string[] = [];
  for (const [userId, review] of latestByUser) {
    if (review.state === "REQUEST_REVIEW") {
      if (!review.dismissed) {
        requested.push(String(userId));
      }
    } else if (
      review.state === "APPROVED" ||
      review.state === "REQUEST_CHANGES" ||
      review.state === "COMMENT"
    ) {
      reviewed.push(String(userId));
    }
  }
  return {requested, reviewed};
};

export const transformPullRequest = (
  pr: GiteaPullRequest,
  repoFullName: string,
  reviewers: ReviewerPartition,
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
  reviewer_ids: reviewers.requested,
  reviewed_by_ids: reviewers.reviewed,
  label_ids: idsOf(pr.labels),
  milestone_id: pr.milestone ? String(pr.milestone.id) : undefined,
});

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
        list.map(async (i) => {
          const [pr, reviews] = await Promise.all([
            gitea.getPullRequest(ctx.owner, ctx.repo, i.number),
            gitea.getPullReviews(ctx.owner, ctx.repo, i.number),
          ]);
          return transformPullRequest(pr, ctx.repoFullName, partitionReviewers(reviews));
        }),
      );
      return {items, hasNext};
    },
  });
};
