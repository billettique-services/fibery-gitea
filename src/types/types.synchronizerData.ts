import {IntegrationAccount} from "./types.authentication.js";
import {SynchronizerDataFilter} from "./types.requests.js";

export type SynchronizationDataType = "delta" | "full";

export type SynchronizerPagination<P> = {
  hasNext: boolean;
  nextPageConfig?: P;
};

export type SynchronizerData<T, P = unknown> = {
  items: Array<Partial<T>>;
  synchronizationType?: SynchronizationDataType;
  pagination?: SynchronizerPagination<P>;
};

export type GetDataFn<T, P = unknown> = (p: {
  account: IntegrationAccount;
  filter?: Partial<SynchronizerDataFilter>;
  lastSynchronizedAt?: string;
  pagination?: P;
}) => Promise<SynchronizerData<T, P>>;

/**
 * Pagination is driven by the list of selected repositories. `repos` holds the
 * repositories that still have to be processed (the first element is the one
 * currently being read); `page` is the 1-based page inside that repository.
 */
export type PaginationConfig = {
  repos?: Array<string>;
  page?: number;
};
