import {config} from "../../config.js";
import {GetDataFn, PaginationConfig} from "../../types/types.synchronizerData.js";
import {createGiteaApi, GiteaComment} from "../../api/gitea.js";
import {issueKey, parseIndexFromUrl} from "../../utils/data.js";
import {paginateRepoScoped, RepoContext} from "./helpers.js";

export const transformComment = (comment: GiteaComment, repoFullName: string) => {
  const isPullRequest = Boolean(comment.pull_request_url);
  const index = parseIndexFromUrl(comment.pull_request_url || comment.issue_url);
  const relatedKey = index !== undefined ? issueKey(repoFullName, index) : undefined;

  return {
    id: String(comment.id),
    name: `Comment ${comment.id}`,
    body: comment.body,
    html_url: comment.html_url,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    author_id: comment.user ? String(comment.user.id) : undefined,
    issue_id: !isPullRequest ? relatedKey : undefined,
    pullrequest_id: isPullRequest ? relatedKey : undefined,
  };
};

export const getComments: GetDataFn<ReturnType<typeof transformComment>, PaginationConfig> = async ({
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
      const {list, hasNext} = await gitea.getComments({
        owner: ctx.owner,
        repo: ctx.repo,
        page,
        limit: config.pageSize,
        since,
      });
      return {items: list.map((c) => transformComment(c, ctx.repoFullName)), hasNext};
    },
  });
};
