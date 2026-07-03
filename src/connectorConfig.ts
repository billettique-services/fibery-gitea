import {ConnectorConfig} from "./types/types.connectorConfig.js";

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
            description: "Personal access token with at least read:repository, read:issue, read:user scopes.",
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
    responsibleFor: {
      userAuthentication: false,
      dataProviding: false,
      dataSynchronization: true,
      dataImport: true,
    },
  };
};
