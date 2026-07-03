import {config} from "../../config.js";
import {GetDataFn, PaginationConfig} from "../../types/types.synchronizerData.js";
import {createGiteaApi, GiteaMilestone} from "../../api/gitea.js";
import {paginateRepoScoped, RepoContext} from "./helpers.js";

export const transformMilestone = (milestone: GiteaMilestone, repoFullName: string) => ({
  id: String(milestone.id),
  name: milestone.title,
  description: milestone.description,
  state: milestone.state === "closed" ? "Closed" : "Open",
  open_issues: milestone.open_issues,
  closed_issues: milestone.closed_issues,
  due_on: milestone.due_on ?? undefined,
  closed_at: milestone.closed_at ?? undefined,
  created_at: milestone.created_at,
  updated_at: milestone.updated_at,
  repository_id: repoFullName,
});

export const getMilestones: GetDataFn<ReturnType<typeof transformMilestone>, PaginationConfig> = async ({
  account,
  filter,
  pagination,
}) => {
  const gitea = createGiteaApi(account);

  return paginateRepoScoped({
    account,
    filter,
    pagination,
    supportsDelta: false,
    fetchPage: async (ctx: RepoContext, page) => {
      const {list, hasNext} = await gitea.getMilestones({
        owner: ctx.owner,
        repo: ctx.repo,
        page,
        limit: config.pageSize,
      });
      return {items: list.map((m) => transformMilestone(m, ctx.repoFullName)), hasNext};
    },
  });
};
