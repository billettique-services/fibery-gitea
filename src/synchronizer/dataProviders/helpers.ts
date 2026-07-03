import {IntegrationAccount} from "../../types/types.authentication.js";
import {SynchronizerDataFilter} from "../../types/types.requests.js";
import {PaginationConfig, SynchronizerData} from "../../types/types.synchronizerData.js";
import {parseRepoFullName} from "../../utils/data.js";

export type RepoContext = {repoFullName: string; owner: string; repo: string};

export type FetchPageResult<Out> = {
  items: Array<Partial<Out>>;
  /** Whether the current repository still has more pages after this one. */
  hasNext: boolean;
};

/**
 * Walks the list of selected repositories one page at a time. The first element
 * of `pagination.repos` is the repository currently being read; once it is
 * exhausted the helper advances to the next repository.
 */
export const paginateRepoScoped = async <Out>({
  filter,
  pagination,
  lastSynchronizedAt,
  supportsDelta,
  fetchPage,
}: {
  account: IntegrationAccount;
  filter?: Partial<SynchronizerDataFilter>;
  pagination?: PaginationConfig;
  lastSynchronizedAt?: string;
  supportsDelta: boolean;
  fetchPage: (ctx: RepoContext, page: number, since?: string) => Promise<FetchPageResult<Out>>;
}): Promise<SynchronizerData<Out, PaginationConfig>> => {
  // Fibery sends `null` (not undefined) for the first, full synchronization.
  const normalizedLastSync = lastSynchronizedAt ?? undefined;
  const synchronizationType = supportsDelta && normalizedLastSync ? "delta" : "full";
  const repos = pagination?.repos ?? filter?.repositories ?? [];
  const page = pagination?.page ?? 1;

  if (repos.length === 0) {
    return {items: [], synchronizationType, pagination: {hasNext: false}};
  }

  const current = repos[0];
  const {owner, repo} = parseRepoFullName(current);
  const since = supportsDelta ? normalizedLastSync : undefined;

  const {items, hasNext} = await fetchPage({repoFullName: current, owner, repo}, page, since);

  if (hasNext) {
    return {items, synchronizationType, pagination: {hasNext: true, nextPageConfig: {repos, page: page + 1}}};
  }

  if (repos.length > 1) {
    return {
      items,
      synchronizationType,
      pagination: {hasNext: true, nextPageConfig: {repos: repos.slice(1), page: 1}},
    };
  }

  return {items, synchronizationType, pagination: {hasNext: false}};
};
