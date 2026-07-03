import {IntegrationAccount} from "../../src/types/types.authentication.js";

export const TEST_BASE_URL = "https://gitea.test";
export const TEST_API_ROOT = `${TEST_BASE_URL}/api/v1`;

export const createTestAccount = (): IntegrationAccount => ({
  auth: "token",
  baseUrl: TEST_BASE_URL,
  apiKey: "test-token",
});
