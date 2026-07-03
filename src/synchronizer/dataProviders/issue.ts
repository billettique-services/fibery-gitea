import {config} from "../../config.js";
import {GetDataFn, PaginationConfig} from "../../types/types.synchronizerData.js";
import {createGiteaApi, GiteaIssue} from "../../api/gitea.js";
import {idsOf, issueKey} from "../../utils/data.js";
import {paginateRepoScoped, RepoContext} from "./helpers.js";

export const transformIssue = (issue: GiteaIssue, repoFullName: string) => ({
  id: issueKey(repoFullName, issue.number),
  name: issue.title,
  number: issue.number,
  state: issue.state === "closed" ? "Closed" : "Open",
  body: issue.body,
  html_url: issue.html_url,
  is_locked: issue.is_locked,
  comments_count: issue.comments,
  due_date: issue.due_date ?? undefined,
  created_at: issue.created_at,
  updated_at: issue.updated_at,
  closed_at: issue.closed_at ?? undefined,
  repository_id: repoFullName,
  author_id: issue.user ? String(issue.user.id) : undefined,
  assignee_ids: idsOf(issue.assignees),
  label_ids: idsOf(issue.labels),
  milestone_id: issue.milestone ? String(issue.milestone.id) : undefined,
});

export const getIssues: GetDataFn<ReturnType<typeof transformIssue>, PaginationConfig> = async ({
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
        type: "issues",
        since,
      });
      // The issues endpoint can return pull requests too; keep only real issues.
      const issues = list.filter((i) => !i.pull_request);
      return {items: issues.map((i) => transformIssue(i, ctx.repoFullName)), hasNext};
    },
  });
};
