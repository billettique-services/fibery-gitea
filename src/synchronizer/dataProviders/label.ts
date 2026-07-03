import {config} from "../../config.js";
import {GetDataFn, PaginationConfig} from "../../types/types.synchronizerData.js";
import {createGiteaApi, GiteaLabel} from "../../api/gitea.js";
import {paginateRepoScoped, RepoContext} from "./helpers.js";

export const transformLabel = (label: GiteaLabel, repoFullName: string) => ({
  id: String(label.id),
  name: label.name,
  description: label.description,
  color: label.color ? `#${label.color.replace(/^#/, "")}` : undefined,
  exclusive: label.exclusive,
  repository_id: repoFullName,
});

export const getLabels: GetDataFn<ReturnType<typeof transformLabel>, PaginationConfig> = async ({
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
      const {list, hasNext} = await gitea.getLabels({
        owner: ctx.owner,
        repo: ctx.repo,
        page,
        limit: config.pageSize,
      });
      return {items: list.map((l) => transformLabel(l, ctx.repoFullName)), hasNext};
    },
  });
};
