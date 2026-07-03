import {SynchronizerSchema} from "../types/types.synchronizerSchema.js";
import {SynchronizerType} from "../types/types.synchronizerConfig.js";
import {IntegrationAccount} from "../types/types.authentication.js";

const integerFormat = {subType: "integer"} as const;

const schema: SynchronizerSchema = {
  [SynchronizerType.Repository]: {
    id: {name: "Id", type: "id"},
    name: {name: "Name", type: "text"},
    description: {name: "Description", type: "text", subType: "md"},
    html_url: {name: "URL", type: "text", subType: "url"},
    private: {name: "Private", type: "text", subType: "boolean"},
    fork: {name: "Fork", type: "text", subType: "boolean"},
    archived: {name: "Archived", type: "text", subType: "boolean"},
    mirror: {name: "Mirror", type: "text", subType: "boolean"},
    default_branch: {name: "Default Branch", type: "text"},
    language: {name: "Language", type: "text"},
    stars_count: {name: "Stars", type: "number", ...integerFormat},
    forks_count: {name: "Forks", type: "number", ...integerFormat},
    watchers_count: {name: "Watchers", type: "number", ...integerFormat},
    open_issues_count: {name: "Open Issues", type: "number", ...integerFormat},
    size: {name: "Size (KB)", type: "number", ...integerFormat},
    created_at: {name: "Created At", type: "date"},
    updated_at: {name: "Updated At", type: "date"},
    owner_id: {
      name: "Owner Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Owner",
        targetName: "Owned Repositories",
        targetType: SynchronizerType.User,
        targetFieldId: "id",
      },
    },
  },
  [SynchronizerType.User]: {
    id: {name: "Id", type: "id"},
    name: {name: "Name", type: "text"},
    login: {name: "Login", type: "text"},
    email: {name: "Email", type: "text", subType: "email"},
    avatar_url: {name: "Avatar", type: "text", subType: "avatar"},
    is_admin: {name: "Is Admin", type: "text", subType: "boolean"},
    created: {name: "Created At", type: "date"},
  },
  [SynchronizerType.Milestone]: {
    id: {name: "Id", type: "id"},
    name: {name: "Name", type: "text"},
    description: {name: "Description", type: "text", subType: "md"},
    state: {
      name: "State",
      type: "text",
      subType: "single-select",
      options: [{name: "Open"}, {name: "Closed"}],
    },
    open_issues: {name: "Open Issues", type: "number", ...integerFormat},
    closed_issues: {name: "Closed Issues", type: "number", ...integerFormat},
    due_on: {name: "Due On", type: "date"},
    closed_at: {name: "Closed At", type: "date"},
    created_at: {name: "Created At", type: "date"},
    updated_at: {name: "Updated At", type: "date"},
    repository_id: {
      name: "Repository Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Repository",
        targetName: "Milestones",
        targetType: SynchronizerType.Repository,
        targetFieldId: "id",
      },
    },
  },
  [SynchronizerType.Label]: {
    id: {name: "Id", type: "id"},
    name: {name: "Name", type: "text"},
    description: {name: "Description", type: "text"},
    color: {name: "Color", type: "text"},
    exclusive: {name: "Exclusive", type: "text", subType: "boolean"},
    repository_id: {
      name: "Repository Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Repository",
        targetName: "Labels",
        targetType: SynchronizerType.Repository,
        targetFieldId: "id",
      },
    },
  },
  [SynchronizerType.Issue]: {
    id: {name: "Id", type: "id"},
    name: {name: "Name", type: "text"},
    number: {name: "Number", type: "number", ...integerFormat},
    state: {
      name: "State",
      type: "text",
      subType: "workflow",
      options: [
        {name: "Open", type: "Not started", default: true},
        {name: "Closed", type: "Finished", final: true},
      ],
    },
    body: {name: "Description", type: "text", subType: "md"},
    html_url: {name: "URL", type: "text", subType: "url"},
    is_locked: {name: "Locked", type: "text", subType: "boolean"},
    comments_count: {name: "Comments Count", type: "number", ...integerFormat},
    due_date: {name: "Due Date", type: "date"},
    created_at: {name: "Created At", type: "date"},
    updated_at: {name: "Updated At", type: "date"},
    closed_at: {name: "Closed At", type: "date"},
    repository_id: {
      name: "Repository Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Repository",
        targetName: "Issues",
        targetType: SynchronizerType.Repository,
        targetFieldId: "id",
      },
    },
    author_id: {
      name: "Author Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Author",
        targetName: "Reported Issues",
        targetType: SynchronizerType.User,
        targetFieldId: "id",
      },
    },
    assignee_ids: {
      name: "Assignee Ids",
      type: "array[text]",
      relation: {
        cardinality: "many-to-many",
        name: "Assignees",
        targetName: "Assigned Issues",
        targetType: SynchronizerType.User,
        targetFieldId: "id",
      },
    },
    label_ids: {
      name: "Label Ids",
      type: "array[text]",
      relation: {
        cardinality: "many-to-many",
        name: "Labels",
        targetName: "Issues",
        targetType: SynchronizerType.Label,
        targetFieldId: "id",
      },
    },
    milestone_id: {
      name: "Milestone Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Milestone",
        targetName: "Issues",
        targetType: SynchronizerType.Milestone,
        targetFieldId: "id",
      },
    },
  },
  [SynchronizerType.PullRequest]: {
    id: {name: "Id", type: "id"},
    name: {name: "Name", type: "text"},
    number: {name: "Number", type: "number", ...integerFormat},
    state: {
      name: "State",
      type: "text",
      subType: "single-select",
      options: [{name: "Open"}, {name: "Closed"}, {name: "Merged"}],
    },
    body: {name: "Description", type: "text", subType: "md"},
    html_url: {name: "URL", type: "text", subType: "url"},
    merged: {name: "Merged", type: "text", subType: "boolean"},
    merged_at: {name: "Merged At", type: "date"},
    mergeable: {name: "Mergeable", type: "text", subType: "boolean"},
    merge_commit_sha: {name: "Merge Commit SHA", type: "text"},
    base_branch: {name: "Base Branch", type: "text"},
    head_branch: {name: "Head Branch", type: "text"},
    diff_url: {name: "Diff URL", type: "text", subType: "url"},
    comments_count: {name: "Comments Count", type: "number", ...integerFormat},
    due_date: {name: "Due Date", type: "date"},
    created_at: {name: "Created At", type: "date"},
    updated_at: {name: "Updated At", type: "date"},
    closed_at: {name: "Closed At", type: "date"},
    repository_id: {
      name: "Repository Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Repository",
        targetName: "Pull Requests",
        targetType: SynchronizerType.Repository,
        targetFieldId: "id",
      },
    },
    author_id: {
      name: "Author Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Author",
        targetName: "Pull Requests",
        targetType: SynchronizerType.User,
        targetFieldId: "id",
      },
    },
    assignee_ids: {
      name: "Assignee Ids",
      type: "array[text]",
      relation: {
        cardinality: "many-to-many",
        name: "Assignees",
        targetName: "Assigned Pull Requests",
        targetType: SynchronizerType.User,
        targetFieldId: "id",
      },
    },
    reviewer_ids: {
      name: "Reviewer Ids",
      type: "array[text]",
      relation: {
        cardinality: "many-to-many",
        name: "Requested Reviewers",
        targetName: "Review Requests",
        targetType: SynchronizerType.User,
        targetFieldId: "id",
      },
    },
    label_ids: {
      name: "Label Ids",
      type: "array[text]",
      relation: {
        cardinality: "many-to-many",
        name: "Labels",
        targetName: "Pull Requests",
        targetType: SynchronizerType.Label,
        targetFieldId: "id",
      },
    },
    milestone_id: {
      name: "Milestone Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Milestone",
        targetName: "Pull Requests",
        targetType: SynchronizerType.Milestone,
        targetFieldId: "id",
      },
    },
  },
  [SynchronizerType.Comment]: {
    id: {name: "Id", type: "id"},
    name: {name: "Name", type: "text"},
    body: {name: "Content", type: "text", subType: "md"},
    html_url: {name: "URL", type: "text", subType: "url"},
    created_at: {name: "Created At", type: "date"},
    updated_at: {name: "Updated At", type: "date"},
    author_id: {
      name: "Author Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Author",
        targetName: "Comments",
        targetType: SynchronizerType.User,
        targetFieldId: "id",
      },
    },
    issue_id: {
      name: "Issue Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Issue",
        targetName: "Comments",
        targetType: SynchronizerType.Issue,
        targetFieldId: "id",
      },
    },
    pullrequest_id: {
      name: "Pull Request Id",
      type: "text",
      relation: {
        cardinality: "many-to-one",
        name: "Pull Request",
        targetName: "Comments",
        targetType: SynchronizerType.PullRequest,
        targetFieldId: "id",
      },
    },
  },
};

export const getSchema = async (
  types: Array<SynchronizerType>,
  _account: IntegrationAccount,
): Promise<SynchronizerSchema> => {
  const result: SynchronizerSchema = {};

  for (const type of types) {
    if (schema[type]) {
      result[type] = schema[type];
    }
  }

  return result;
};
