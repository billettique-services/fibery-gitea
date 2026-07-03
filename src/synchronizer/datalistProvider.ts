import {config} from "../config.js";
import {ValidationError} from "../errors/errors.js";
import {createGiteaApi} from "../api/gitea.js";
import {IntegrationAccount} from "../types/types.authentication.js";
import {SynchronizerFilter} from "../types/types.synchronizerConfig.js";

export type DatalistItem = {title: string; value: string};

const MAX_PAGES = 100;

const getRepositories = async (account: IntegrationAccount): Promise<DatalistItem[]> => {
  const gitea = createGiteaApi(account);
  const items: DatalistItem[] = [];

  let page = 1;
  let hasNext = true;
  while (hasNext && page <= MAX_PAGES) {
    const {list, hasNext: more} = await gitea.getAccessibleRepositories({page, limit: config.pageSize});
    for (const repo of list) {
      items.push({title: repo.full_name, value: repo.full_name});
    }
    hasNext = more;
    page += 1;
  }

  return items;
};

export const getDatalist = async (field: string, account: IntegrationAccount): Promise<{items: DatalistItem[]}> => {
  switch (field) {
    case SynchronizerFilter.Repositories:
      return {items: await getRepositories(account)};
    default:
      throw new ValidationError(`Unknown datalist field "${field}"`);
  }
};
