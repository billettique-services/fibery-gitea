import {describe, expect, it} from "vitest";
import {getConfigWarnings} from "../src/infra/startupChecks.js";

describe(`getConfigWarnings`, () => {
  it(`warns when production runs without a webhook secret`, () => {
    expect(getConfigWarnings({nodeEnv: "production", webhookSecret: ""})).toEqual([
      expect.stringContaining("WEBHOOK_SECRET is not set"),
    ]);
  });
  it(`stays quiet when a secret is set`, () => {
    expect(getConfigWarnings({nodeEnv: "production", webhookSecret: "x"})).toEqual([]);
  });
  it(`stays quiet outside production`, () => {
    expect(getConfigWarnings({nodeEnv: "development", webhookSecret: ""})).toEqual([]);
    expect(getConfigWarnings({nodeEnv: "test", webhookSecret: ""})).toEqual([]);
  });
});
