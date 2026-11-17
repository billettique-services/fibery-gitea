import {ConnectorConfig} from "./types/types.connectorConfig.js";

export const CREATE_BRANCH_ACTION = "create-branch";

export const getConnectorConfig = (): ConnectorConfig => {
  return {
    id: `gitea-connector`,
    name: `Gitea`,
    version: "1.0.0",
    type: "crunch",
    description: "Sync Gitea repositories, issues, pull requests and more into Fibery.",
    authentication: [
      {
        description: "Provide your Gitea instance URL and a personal access token.",
        name: "Token Authentication",
        id: "token",
        fields: [
          {
            title: "Gitea URL",
            description: "Base URL of your Gitea instance. Example: https://gitea.com or https://git.mycompany.io",
            type: "text",
            id: "baseUrl",
          },
          {
            title: "Access Token",
            description:
              "Personal access token with at least read:repository, read:issue, read:user scopes. Add write:repository to use the Create branch action.",
            type: "password",
            id: "apiKey",
          },
          {
            type: "link",
            value: "https://docs.gitea.com/development/api-usage#authentication",
            description: "Generate a personal access token in Settings → Applications.",
            id: "token-link",
            name: "How to create an access token...",
          },
        ],
      },
    ],
    sources: [],
    actions: [
      {
        action: CREATE_BRANCH_ACTION,
        name: "Create branch",
        description: "Create a branch in a Gitea repository using the integration account.",
        args: [
          {
            id: "repo",
            name: "Repository",
            description: "Full repository name, e.g. owner/repo",
            type: "text",
            textTemplateSupported: true,
          },
          {
            id: "name",
            name: "Branch name",
            type: "text",
            textTemplateSupported: true,
          },
          {
            id: "ref",
            name: "Source branch",
            description: "Branch, tag or commit to branch from. Defaults to the repository's default branch.",
            type: "text",
            textTemplateSupported: true,
            optional: true,
          },
        ],
      },
    ],
    responsibleFor: {
      userAuthentication: false,
      dataProviding: false,
      dataSynchronization: true,
      dataImport: true,
      automations: true,
    },
  };
};
