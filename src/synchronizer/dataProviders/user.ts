import {config} from "../../config.js";
import {GetDataFn, PaginationConfig} from "../../types/types.synchronizerData.js";
import {createGiteaApi, GiteaApi, GiteaUser} from "../../api/gitea.js";
import {paginateRepoScoped, RepoContext} from "./helpers.js";

export const transformUser = (user: GiteaUser) => ({
  id: String(user.id),
  name: user.full_name || user.login,
  login: user.login,
  email: user.email,
  avatar_url: user.avatar_url,
  is_admin: user.is_admin,
  created: user.created,
});

const MAX_PAGES = 100;

/**
 * Collects every user related to a repository: its collaborators (direct
 * access) and its assignees (which, for org repositories, includes team members
 * that the collaborators endpoint omits). Users are deduplicated by id per
 * repository; Fibery further upserts by id across repositories.
 */
const collectRepoUsers = async (gitea: GiteaApi, ctx: RepoContext): Promise<GiteaUser[]> => {
  const byId = new Map<number, GiteaUser>();

  let page = 1;
  let hasNext = true;
  while (hasNext && page <= MAX_PAGES) {
    const {list, hasNext: more} = await gitea.getCollaborators({
      owner: ctx.owner,
      repo: ctx.repo,
      page,
      limit: config.pageSize,
    });
    for (const user of list) {
      byId.set(user.id, user);
    }
    hasNext = more;
    page += 1;
  }

  for (const user of await gitea.getAssignees({owner: ctx.owner, repo: ctx.repo})) {
    byId.set(user.id, user);
  }

  return [...byId.values()];
};

export const getUsers: GetDataFn<ReturnType<typeof transformUser>, PaginationConfig> = async ({
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
      const users = await collectRepoUsers(gitea, ctx);
      return {items: users.map(transformUser), hasNext: false};
    },
  });
};
