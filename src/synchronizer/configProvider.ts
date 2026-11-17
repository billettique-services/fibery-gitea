import {config} from "../config.js";
import {SynchronizerConfig, SynchronizerFilter, SynchronizerType} from "../types/types.synchronizerConfig.js";

export const getSynchronizerConfig = (): SynchronizerConfig => {
  return {
    types: [
      {
        id: SynchronizerType.Repository,
        name: "Repository",
        default: true,
      },
      {
        id: SynchronizerType.Issue,
        name: "Issue",
        default: true,
      },
      {
        id: SynchronizerType.PullRequest,
        name: "Pull Request",
        default: true,
      },
      {
        id: SynchronizerType.Milestone,
        name: "Milestone",
        default: true,
      },
      {
        id: SynchronizerType.Label,
        name: "Label",
        default: true,
      },
      {
        id: SynchronizerType.User,
        name: "User",
        default: true,
        isUser: true,
      },
      {
        id: SynchronizerType.Comment,
        name: "Comment",
        default: false,
      },
    ],
    filters: [
      {
        id: SynchronizerFilter.Repositories,
        title: "Repositories",
        datalist: true,
        optional: false,
        type: "multidropdown",
      },
    ],
    version: config.apiVersion,
    webhooks: {enabled: true, type: "ui"},
  };
};
