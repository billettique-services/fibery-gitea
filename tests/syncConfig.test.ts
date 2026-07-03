import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {getRestClient} from "./restClient.js";
import {createTestApp} from "./testApp.js";
import {createTestAccount} from "./mocks/testAccount.js";
import {SynchronizerFilter, SynchronizerType} from "../src/types/types.synchronizerConfig.js";

describe(`POST /api/v1/synchronizer/config`, () => {
  let app: ReturnType<typeof createTestApp>;
  let restClient: ReturnType<typeof getRestClient>;

  beforeAll(async () => {
    app = createTestApp();
    restClient = getRestClient(app.url);
  });

  afterAll(async () => app.destroy());

  it(`returns all types and the repositories filter`, async () => {
    const res = await restClient.getSyncConfig(createTestAccount());

    expect(res.statusCode).toEqual(200);
    const typeIds = res.body.types.map((t) => t.id);
    expect(typeIds).toEqual(
      expect.arrayContaining([
        SynchronizerType.Repository,
        SynchronizerType.Issue,
        SynchronizerType.PullRequest,
        SynchronizerType.Milestone,
        SynchronizerType.Label,
        SynchronizerType.User,
        SynchronizerType.Comment,
      ]),
    );
    expect(res.body.filters).toHaveLength(1);
    expect(res.body.filters[0]).toMatchObject({
      id: SynchronizerFilter.Repositories,
      type: "multidropdown",
      datalist: true,
      optional: false,
    });
  });
});
