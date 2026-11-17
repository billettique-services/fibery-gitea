import nock from "nock";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import {createTestApp} from "./testApp.js";
import {createTestAccount, TEST_BASE_URL} from "./mocks/testAccount.js";

describe(`POST /api/v1/automations/action/execute`, () => {
  let app: ReturnType<typeof createTestApp>;
  const account = createTestAccount();

  beforeAll(() => {
    app = createTestApp();
  });
  afterEach(() => nock.cleanAll());
  afterAll(async () => app.destroy());

  const execute = async (body: unknown) => {
    const response = await fetch(`${app.url}/api/v1/automations/action/execute`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
    return {statusCode: response.status, body: (await response.json()) as Record<string, unknown>};
  };

  it(`is advertised in the connector config`, async () => {
    const config = (await (await fetch(`${app.url}/`)).json()) as {
      actions: Array<{action: string; args: Array<{id: string}>}>;
      responsibleFor: {automations?: boolean};
    };
    expect(config.responsibleFor.automations).toBe(true);
    expect(config.actions).toHaveLength(1);
    expect(config.actions[0].action).toEqual("create-branch");
    expect(config.actions[0].args.map((a) => a.id)).toEqual(["repo", "name", "ref"]);
  });

  it(`creates a branch from the given ref using the account token`, async () => {
    let received: unknown;
    nock(TEST_BASE_URL, {reqheaders: {authorization: "token test-token"}})
      .post(`/api/v1/repos/octo/repo1/branches`, (body) => {
        received = body;
        return true;
      })
      .reply(201, {name: "feature/x"});

    const res = await execute({
      action: {action: "create-branch", args: {repo: " octo/repo1 ", name: "feature/x", ref: "develop"}},
      account,
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({});
    expect(received).toEqual({new_branch_name: "feature/x", old_ref_name: "develop", old_branch_name: "develop"});
  });

  it(`branches from the default branch when ref is empty`, async () => {
    let received: unknown;
    nock(TEST_BASE_URL)
      .post(`/api/v1/repos/octo/repo1/branches`, (body) => {
        received = body;
        return true;
      })
      .reply(201, {name: "feature/x"});

    const res = await execute({
      action: {action: "create-branch", args: {repo: "octo/repo1", name: "feature/x", ref: ""}},
      account,
    });

    expect(res.statusCode).toEqual(200);
    expect(received).toEqual({new_branch_name: "feature/x"});
  });

  it(`reports Gitea's message when the branch already exists`, async () => {
    nock(TEST_BASE_URL).post(`/api/v1/repos/octo/repo1/branches`).reply(409, {message: "branch already exists"});

    const res = await execute({
      action: {action: "create-branch", args: {repo: "octo/repo1", name: "feature/x"}},
      account,
    });

    expect(res.statusCode).toEqual(409);
    expect(res.body.message).toEqual("branch already exists");
  });

  it.each([
    [{repo: "", name: "x"}, `"repo" is required`],
    [{repo: "octo/repo1", name: " "}, `"name" is required`],
    [{repo: "norepo", name: "x"}, `Invalid repository name`],
  ])(`rejects invalid arguments %j`, async (args, message) => {
    const res = await execute({action: {action: "create-branch", args}, account});
    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toContain(message);
  });

  it(`rejects unknown actions and missing account`, async () => {
    expect((await execute({action: {action: "nope", args: {}}, account})).statusCode).toEqual(400);
    expect((await execute({action: {action: "create-branch", args: {}}})).statusCode).toEqual(400);
  });
});
