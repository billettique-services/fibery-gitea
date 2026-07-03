import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {getRestClient} from "./restClient.js";
import {createTestApp} from "./testApp.js";
import {createTestAccount} from "./mocks/testAccount.js";
import {SynchronizerType} from "../src/types/types.synchronizerConfig.js";

describe(`POST /api/v1/synchronizer/schema`, () => {
  let app: ReturnType<typeof createTestApp>;
  let restClient: ReturnType<typeof getRestClient>;

  beforeAll(async () => {
    app = createTestApp();
    restClient = getRestClient(app.url);
  });

  afterAll(async () => app.destroy());

  it(`returns schema for requested types with id and name`, async () => {
    const res = await restClient.getSyncSchema({
      account: createTestAccount(),
      types: [SynchronizerType.Repository, SynchronizerType.Issue],
    });

    expect(res.statusCode).toEqual(200);
    expect(Object.keys(res.body)).toEqual([SynchronizerType.Repository, SynchronizerType.Issue]);
    expect(res.body[SynchronizerType.Issue].id).toEqual({name: "Id", type: "id"});
    expect(res.body[SynchronizerType.Issue].name).toMatchObject({type: "text"});
    // Relation from issue to repository
    expect(res.body[SynchronizerType.Issue].repository_id.relation).toMatchObject({
      targetType: SynchronizerType.Repository,
      cardinality: "many-to-one",
    });
  });
});
