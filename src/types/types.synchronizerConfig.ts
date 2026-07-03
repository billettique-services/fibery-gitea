type SynchronizerTypeMeta = {
  id: SynchronizerType;
  name: string;
  default: boolean;
  isUser?: boolean;
};

type SynchronizerFilterMeta = {
  id: SynchronizerFilter;
  title: string;
  datalist?: boolean;
  secured?: boolean;
  optional: boolean;
  type: "bool" | "list" | "multidropdown" | "datebox" | "text" | "number";
  datalist_requires?: Array<SynchronizerFilter>;
  defaultValue?: unknown;
};

export type SynchronizerConfig = {
  types: Array<SynchronizerTypeMeta>;
  filters: Array<SynchronizerFilterMeta>;
  version: number;
};

export enum SynchronizerType {
  Repository = "repository",
  User = "user",
  Issue = "issue",
  PullRequest = "pullrequest",
  Milestone = "milestone",
  Label = "label",
  Comment = "comment",
}

/** Types whose data is fetched per selected repository (i.e. driven by the repositories filter) */
export const repoScopedTypes: SynchronizerType[] = [
  SynchronizerType.Repository,
  SynchronizerType.Issue,
  SynchronizerType.PullRequest,
  SynchronizerType.Milestone,
  SynchronizerType.Label,
  SynchronizerType.Comment,
];

export enum SynchronizerFilter {
  Repositories = "repositories",
}
