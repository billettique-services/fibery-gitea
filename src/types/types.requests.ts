import {AuthenticationType, IntegrationAccount} from "./types.authentication.js";
import {SynchronizerType} from "./types.synchronizerConfig.js";
import {PaginationConfig} from "./types.synchronizerData.js";

export type AccountValidateRequestBody = {
  id: AuthenticationType;
  fields: IntegrationAccount;
};

export type GetSynchronizerSchemaRequestBody = {
  account: IntegrationAccount;
  types: Array<SynchronizerType>;
};

export type SynchronizerDataFilter = {
  /** Full names ("owner/repo") of repositories selected for synchronization */
  repositories?: Array<string>;
};

export type GetDataRequestBody = {
  account?: IntegrationAccount;
  requestedType?: SynchronizerType;
  filter?: Partial<SynchronizerDataFilter>;
  lastSynchronizedAt?: string;
  pagination?: PaginationConfig;
  version?: string;
};

export type DatalistRequestBody = {
  account?: IntegrationAccount;
  types?: Array<SynchronizerType>;
  field?: string;
  dependsOn?: Record<string, unknown>;
};
