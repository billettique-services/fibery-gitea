import nock from "nock";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import {createGiteaApi} from "../src/api/gitea.js";
import {config} from "../src/config.js";
import {ValidationError} from "../src/errors/errors.js";
import {SynchronizerType} from "../src/types/types.synchronizerConfig.js";
import {parseRepoFullName, validateBaseUrl} from "../src/utils/data.js";
import {createTestAccount, TEST_BASE_URL} from "./mocks/testAccount.js";
import {getRestClient} from "./restClient.js";
import {createTestApp} from "./testApp.js";

const originalAllowedHosts = config.allowedGiteaHosts;

afterEach(() => {
  config.allowedGiteaHosts = originalAllowedHosts;
  nock.cleanAll();
});

describe(`validateBaseUrl`, () => {
  it.each([
    "gitea.test",
    "https://gitea.test/",
    "http://localhost:3000",
    "https://git.co/prefix",
    "https://gitea.test/api/v1",
    "gitea.test:3000",
  ])(`accepts %j`, (baseUrl) => {
    expect(() => validateBaseUrl(baseUrl)).not.toThrow();
  });

  it.each([
    "https://gitea.test/#",
    "https://gitea.test/?x=",
    "https://gitea.test/a#b",
    "https://user:pw@gitea.test",
    "ftp://gitea.test",
    "file:///etc/passwd",
    "",
    "   ",
    "https://gitea.test/ x",
    "javascript:alert(1)",
  ])(`rejects %j`, (baseUrl) => {
    expect(() => validateBaseUrl(baseUrl)).toThrow(ValidationError);
  });

  it(`rejects a missing base URL`, () => {
    expect(() => validateBaseUrl(undefined)).toThrow(ValidationError);
  });
});

describe(`ALLOWED_GITEA_HOSTS allowlist`, () => {
  it(`accepts only listed hosts, matching host and host:port case-insensitively`, () => {
    config.allowedGiteaHosts = ["gitea.test", "git.corp:8443"];

    expect(() => validateBaseUrl("https://GITEA.test/x")).not.toThrow();
    expect(() => validateBaseUrl("https://git.corp:8443")).not.toThrow();
    expect(() => validateBaseUrl("https://other.test")).toThrow(ValidationError);
    expect(() => validateBaseUrl("https://git.corp:9000")).toThrow(ValidationError);
  });

  it(`accepts any host when the list is empty`, () => {
    config.allowedGiteaHosts = [];

    expect(() => validateBaseUrl("https://other.test")).not.toThrow();
  });
});

describe(`parseRepoFullName`, () => {
  it.each([
    ["octo/repo1", {owner: "octo", repo: "repo1"}],
    ["octo/repo-1.x_y", {owner: "octo", repo: "repo-1.x_y"}],
  ])(`accepts %j`, (fullName, expected) => {
    expect(parseRepoFullName(fullName)).toEqual(expected);
  });

  it.each([
    "a/b/c",
    "../x",
    "octo/..",
    "octo/.",
    "octo/repo?x=1",
    "octo/repo#",
    "/b",
    "a/",
    "norepo",
    "a b/c",
    "",
    "a//b",
  ])(`rejects %j`, (fullName) => {
    expect(() => parseRepoFullName(fullName)).toThrow(ValidationError);
  });
});

describe(`repository path encoding`, () => {
  it(`percent-encodes owner and repository segments`, async () => {
    nock(TEST_BASE_URL).get(`/api/v1/repos/a%20b/c%3Fd`).reply(200, {id: 1, name: "c?d", full_name: "a b/c?d"});

    await expect(createGiteaApi(createTestAccount()).getRepository("a b", "c?d")).resolves.toMatchObject({
      full_name: "a b/c?d",
    });
  });
});

describe(`request target validation over REST`, () => {
  let app: ReturnType<typeof createTestApp>;
  let restClient: ReturnType<typeof getRestClient>;
  const account = createTestAccount();

  beforeAll(() => {
    app = createTestApp();
    restClient = getRestClient(app.url);
  });
  afterAll(async () => app.destroy());

  const execute = async (args: Record<string, string>) => {
    const response = await fetch(`${app.url}/api/v1/automations/action/execute`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: {action: "create-branch", args}, account}),
    });
    return {statusCode: response.status, body: (await response.json()) as Record<string, unknown>};
  };

  it(`rejects a base URL with a fragment on /validate without calling Gitea`, async () => {
    const res = await restClient.validate({auth: "token", baseUrl: "https://gitea.test/#", apiKey: "x"});

    expect(res.statusCode).toEqual(400);
  });

  it(`rejects a base URL with embedded credentials on the data endpoint`, async () => {
    const res = await restClient.getSyncData({
      account: {...account, baseUrl: "https://user:pw@gitea.test"},
      requestedType: SynchronizerType.Issue,
      filter: {repositories: ["octo/repo1"]},
    });

    expect(res.statusCode).toEqual(400);
  });

  it.each(["../admin/x", "octo/repo1?x=1"])(`rejects the Create branch repository %j`, async (repo) => {
    const res = await execute({repo, name: "b"});

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toContain(`Invalid repository name`);
  });

  it(`does not advertise the framework in the x-powered-by header`, async () => {
    const response = await fetch(`${app.url}/status`);

    expect(response.status).toEqual(200);
    expect(response.headers.get("x-powered-by")).toBeNull();
  });
});

describe(`redirects`, () => {
  it(`refuses to follow a redirect when an allowlist is configured`, async () => {
    config.allowedGiteaHosts = ["gitea.test"];
    nock(TEST_BASE_URL).get(`/api/v1/user`).reply(302, "", {location: "https://other.test/x"});
    // Reachable on purpose: if the redirect were followed, validate() would resolve instead of failing.
    const target = nock("https://other.test").get(`/x`).reply(200, {id: 1, login: "octocat"});

    await expect(createGiteaApi(createTestAccount()).validate()).rejects.toMatchObject({statusCode: 502});
    expect(target.isDone()).toBe(false);
  });

  it(`still follows redirects when the allowlist is empty`, async () => {
    config.allowedGiteaHosts = [];
    nock(TEST_BASE_URL).get(`/api/v1/user`).reply(302, "", {location: "https://other.test/x"});
    nock("https://other.test").get(`/x`).reply(200, {id: 1, login: "octocat"});

    await expect(createGiteaApi(createTestAccount()).validate()).resolves.toEqual({id: 1, login: "octocat"});
  });
});
