import {AuthenticationType} from "./types.authentication.js";

type ConnectorConfigAuthenticationField = {
  id: string;
  title: string;
  description?: string;
  type: "oauth" | "password" | "text";
};

type ConnectorConfigLinkField = {
  id: string;
  name: string;
  description?: string;
  value: string;
  type: "link";
};

type ConnectorConfigAuthentication = {
  id: AuthenticationType;
  name: string;
  description: string;
  fields: Array<ConnectorConfigAuthenticationField | ConnectorConfigLinkField>;
  type?: "oauth2" | "oauth1";
  provider?: string;
};

type Source = Record<string, unknown>;

type ConnectorConfigActionArg = {
  id: string;
  name: string;
  description?: string;
  type: "text" | "textarea";
  textTemplateSupported?: boolean;
  optional?: boolean;
};

export type ConnectorConfigAction = {
  action: string;
  name: string;
  description?: string;
  args: Array<ConnectorConfigActionArg>;
};

export type ConnectorConfig = {
  id: string;
  name: string;
  version: string;
  type: string;
  description: string;
  authentication: Array<ConnectorConfigAuthentication>;
  sources: Array<Source>;
  actions?: Array<ConnectorConfigAction>;
  responsibleFor: {
    userAuthentication: boolean;
    dataProviding: boolean;
    dataSynchronization: boolean;
    dataImport: boolean;
    automations?: boolean;
  };
};
