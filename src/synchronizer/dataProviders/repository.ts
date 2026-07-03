import {GetDataFn, PaginationConfig} from "../../types/types.synchronizerData.js";
import {createGiteaApi, GiteaRepository} from "../../api/gitea.js";
import {paginateRepoScoped} from "./helpers.js";

export const transformRepository = (repo: GiteaRepository) => ({
  id: repo.full_name,
  name: repo.full_name,
  description: repo.description,
  html_url: repo.html_url,
  private: repo.private,
  fork: repo.fork,
  archived: repo.archived,
  mirror: repo.mirror,
  default_branch: repo.default_branch,
  language: repo.language,
  stars_count: repo.stars_count,
  forks_count: repo.forks_count,
  watchers_count: repo.watchers_count,
  open_issues_count: repo.open_issues_count,
  size: repo.size,
  created_at: repo.created_at,
  updated_at: repo.updated_at,
  owner_id: repo.owner ? String(repo.owner.id) : undefined,
});

export const getRepositories: GetDataFn<ReturnType<typeof transformRepository>, PaginationConfig> = async ({
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
    fetchPage: async (ctx) => {
      const repo = await gitea.getRepository(ctx.owner, ctx.repo);
      return {items: [transformRepository(repo)], hasNext: false};
    },
  });
};
