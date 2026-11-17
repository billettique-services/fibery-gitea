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

export type ExecuteActionRequestBody = {
  action?: {
    action?: string;
    args?: Record<string, unknown>;
  };
  account?: IntegrationAccount;
};

export type WebhookInstallRequestBody = {
  types?: Array<SynchronizerType>;
  filter?: Partial<SynchronizerDataFilter>;
  account?: IntegrationAccount;
  /** `null` on first install, otherwise whatever the previous install returned. */
  webhook?: {id?: string; workspaceId?: string} | null;
};

/** The third-party request as forwarded by Fibery; key names vary, so both spellings are accepted. */
export type WebhookPreProcessRequestBody = {
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: unknown;
  payload?: unknown;
};

export type WebhookTransformRequestBody = {
  params?: Record<string, unknown>;
  payload?: unknown;
  types?: Array<SynchronizerType>;
  filter?: Partial<SynchronizerDataFilter>;
  account?: IntegrationAccount;
};
