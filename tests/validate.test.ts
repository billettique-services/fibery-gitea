import nock from "nock";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import {getRestClient} from "./restClient.js";
import {createTestApp} from "./testApp.js";
import {createTestAccount, TEST_BASE_URL} from "./mocks/testAccount.js";

describe(`POST /validate`, () => {
  let app: ReturnType<typeof createTestApp>;
  let restClient: ReturnType<typeof getRestClient>;
  const account = createTestAccount();

  beforeAll(async () => {
    app = createTestApp();
    restClient = getRestClient(app.url);
  });

  afterEach(() => nock.cleanAll());
  afterAll(async () => app.destroy());

  it(`returns the account name on success`, async () => {
    nock(TEST_BASE_URL).get(`/api/v1/user`).reply(200, {id: 1, login: "octocat", full_name: "The Octocat"});

    const res = await restClient.validate(account);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({name: "The Octocat"});
  });

  it(`falls back to login when full name is empty`, async () => {
    nock(TEST_BASE_URL).get(`/api/v1/user`).reply(200, {id: 1, login: "octocat"});

    const res = await restClient.validate(account);

    expect(res.body).toEqual({name: "octocat"});
  });

  it(`propagates authentication errors`, async () => {
    nock(TEST_BASE_URL).get(`/api/v1/user`).reply(401, {message: "token is invalid"});

    const res = await restClient.validate(account);

    expect(res.statusCode).toEqual(401);
  });

  it(`rejects an empty base URL`, async () => {
    const res = await restClient.validate({auth: "token", baseUrl: "", apiKey: "x"});

    expect(res.statusCode).toEqual(400);
  });
});
