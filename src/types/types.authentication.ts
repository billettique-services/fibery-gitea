export type AuthenticationType = "none" | "token" | "oauth2";

export type TokenAuthentication = {
  auth?: "token";
  /** Base URL of the Gitea instance, e.g. https://gitea.com */
  baseUrl: string;
  /** Personal access token */
  apiKey: string;
};

export type IntegrationAccount = TokenAuthentication;
