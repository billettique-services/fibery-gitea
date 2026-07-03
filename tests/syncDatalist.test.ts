import nock from "nock";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import {getRestClient} from "./restClient.js";
import {createTestApp} from "./testApp.js";
import {createTestAccount, TEST_BASE_URL} from "./mocks/testAccount.js";
import {SynchronizerFilter} from "../src/types/types.synchronizerConfig.js";

describe(`POST /api/v1/synchronizer/datalist`, () => {
  let app: ReturnType<typeof createTestApp>;
  let restClient: ReturnType<typeof getRestClient>;
  const account = createTestAccount();

  beforeAll(async () => {
    app = createTestApp();
    restClient = getRestClient(app.url);
  });

  afterEach(() => nock.cleanAll());
  afterAll(async () => app.destroy());

  it(`lists accessible repositories as title/value pairs`, async () => {
    nock(TEST_BASE_URL)
      .get(`/api/v1/user/repos`)
      .query({page: 1, limit: 50})
      .reply(200, [
        {id: 1, name: "repo1", full_name: "octo/repo1"},
        {id: 2, name: "repo2", full_name: "octo/repo2"},
      ]);

    const res = await restClient.getSyncDatalist({account, field: SynchronizerFilter.Repositories});

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      items: [
        {title: "octo/repo1", value: "octo/repo1"},
        {title: "octo/repo2", value: "octo/repo2"},
      ],
    });
  });
});
