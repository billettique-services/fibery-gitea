import nock from "nock";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import {getRestClient} from "./restClient.js";
import {createTestApp} from "./testApp.js";
import {createTestAccount, TEST_BASE_URL} from "./mocks/testAccount.js";
import {SynchronizerFilter, SynchronizerType} from "../src/types/types.synchronizerConfig.js";

describe(`synchronizer data for milestones, labels, pagination, users, datalist and errors`, () => {
  let app: ReturnType<typeof createTestApp>;
  let restClient: ReturnType<typeof getRestClient>;
  const account = createTestAccount();
  const gitea = () => nock(TEST_BASE_URL);
  const repoPath = `/api/v1/repos/octo/repo1`;
  const filter = {repositories: ["octo/repo1"]};

  beforeAll(async () => {
    app = createTestApp();
    restClient = getRestClient(app.url);
  });

  afterEach(() => nock.cleanAll());
  afterAll(async () => app.destroy());

  it(`transforms milestones`, async () => {
    gitea()
      .get(`${repoPath}/milestones`)
      .query({page: 1, limit: 50, state: "all"})
      .reply(200, [
        {
          id: 5,
          title: "v1",
          description: "first",
          state: "closed",
          open_issues: 0,
          closed_issues: 3,
          due_on: null,
          closed_at: "2026-01-02T00:00:00Z",
        },
        {id: 6, title: "v2", state: "open", open_issues: 4, closed_issues: 0},
      ]);

    const res = await restClient.getSyncData({account, requestedType: SynchronizerType.Milestone, filter});

    expect(res.statusCode).toEqual(200);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        id: "5",
        name: "v1",
        state: "Closed",
        open_issues: 0,
        closed_issues: 3,
        repository_id: "octo/repo1",
        closed_at: "2026-01-02T00:00:00Z",
      }),
      expect.objectContaining({id: "6", name: "v2", state: "Open"}),
    ]);
    expect(res.body.items[0]).not.toHaveProperty("due_on");
    expect(res.body.pagination).toEqual({hasNext: false});
    expect(res.body.synchronizationType).toEqual("full");
  });

  it(`transforms labels, prefixing colors with # only when present`, async () => {
    gitea()
      .get(`${repoPath}/labels`)
      .query({page: 1, limit: 50})
      .reply(200, [
        {id: 1, name: "bug", color: "ee0701", exclusive: false},
        {id: 2, name: "ui", color: "#00ff00"},
        {id: 3, name: "plain"},
      ]);

    const res = await restClient.getSyncData({account, requestedType: SynchronizerType.Label, filter});

    expect(res.statusCode).toEqual(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0]).toMatchObject({id: "1", name: "bug", color: "#ee0701", exclusive: false});
    expect(res.body.items[1]).toMatchObject({id: "2", color: "#00ff00"});
    expect(res.body.items[2]).not.toHaveProperty("color");
  });

  it(`continues with page 2 of issues when the first page is full`, async () => {
    gitea()
      .get(`${repoPath}/issues`)
      .query({page: 1, limit: 50, type: "issues", state: "all"})
      .reply(
        200,
        Array.from({length: 50}, (_, i) => ({id: i + 1, number: i + 1, title: `t${i + 1}`, state: "open"})),
      );

    const res1 = await restClient.getSyncData({account, requestedType: SynchronizerType.Issue, filter});

    expect(res1.statusCode).toEqual(200);
    expect(res1.body.items).toHaveLength(50);
    expect(res1.body.pagination).toEqual({hasNext: true, nextPageConfig: {repos: ["octo/repo1"], page: 2}});

    gitea()
      .get(`${repoPath}/issues`)
      .query({page: 2, limit: 50, type: "issues", state: "all"})
      .reply(
        200,
        Array.from({length: 3}, (_, i) => ({id: i + 51, number: i + 51, title: `t${i + 51}`, state: "open"})),
      );

    const res2 = await restClient.getSyncData({
      account,
      requestedType: SynchronizerType.Issue,
      filter,
      pagination: {repos: ["octo/repo1"], page: 2},
    });

    expect(res2.statusCode).toEqual(200);
    expect(res2.body.items).toHaveLength(3);
    expect(res2.body.pagination).toEqual({hasNext: false});
  });

  it(`performs a delta sync of comments using the since parameter`, async () => {
    const since = "2026-06-01T00:00:00.000Z";
    gitea()
      .get(`${repoPath}/issues/comments`)
      .query({page: 1, limit: 50, since})
      .reply(200, [{id: 1, body: "x", issue_url: "https://gitea.test/api/v1/repos/octo/repo1/issues/3"}]);

    const res = await restClient.getSyncData({
      account,
      requestedType: SynchronizerType.Comment,
      filter,
      lastSynchronizedAt: since,
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body.synchronizationType).toEqual("delta");
    expect(res.body.items[0]).toMatchObject({issue_id: "octo/repo1#3"});
  });

  it(`collects users across collaborator pages and de-duplicates them against assignees`, async () => {
    gitea()
      .get(`${repoPath}/collaborators`)
      .query({page: 1, limit: 50})
      .reply(
        200,
        Array.from({length: 50}, (_, i) => ({id: i + 1, login: `u${i + 1}`})),
      );
    gitea()
      .get(`${repoPath}/collaborators`)
      .query({page: 2, limit: 50})
      .reply(200, [{id: 51, login: "u51"}]);
    gitea()
      .get(`${repoPath}/assignees`)
      .reply(200, [{id: 51, login: "u51"}]);

    const res = await restClient.getSyncData({account, requestedType: SynchronizerType.User, filter});

    expect(res.statusCode).toEqual(200);
    expect(res.body.items).toHaveLength(51);
    expect(res.body.items.map((u) => (u as {id: string}).id)).toEqual(
      Array.from({length: 51}, (_, i) => String(i + 1)),
    );
  });

  it(`tolerates a 404 from the assignees endpoint`, async () => {
    gitea()
      .get(`${repoPath}/collaborators`)
      .query({page: 1, limit: 50})
      .reply(200, [{id: 10, login: "a"}]);
    gitea().get(`${repoPath}/assignees`).reply(404, {message: "no"});

    const res = await restClient.getSyncData({account, requestedType: SynchronizerType.User, filter});

    expect(res.statusCode).toEqual(200);
    expect(res.body.items).toEqual([expect.objectContaining({id: "10"})]);
    expect(res.body.items).toHaveLength(1);
  });

  it(`lists repositories for the datalist across pages`, async () => {
    gitea()
      .get(`/api/v1/user/repos`)
      .query({page: 1, limit: 50})
      .reply(
        200,
        Array.from({length: 50}, (_, i) => ({id: i + 1, name: `r${i + 1}`, full_name: `octo/r${i + 1}`})),
      );
    gitea()
      .get(`/api/v1/user/repos`)
      .query({page: 2, limit: 50})
      .reply(200, [{id: 51, name: "r51", full_name: "octo/r51"}]);

    const res = await restClient.getSyncDatalist({account, field: SynchronizerFilter.Repositories});

    expect(res.statusCode).toEqual(200);
    const {items} = res.body as {items: Array<{title: string; value: string}>};
    expect(items).toHaveLength(51);
    expect(items[0]).toEqual({title: "octo/r1", value: "octo/r1"});
    expect(items[50]).toEqual({title: "octo/r51", value: "octo/r51"});
  });

  it(`validates the data request`, async () => {
    const bogus = await restClient.getSyncData({
      account,
      requestedType: "bogus" as SynchronizerType,
      filter,
    });
    expect(bogus.statusCode).toEqual(400);
    expect((bogus.body as unknown as {message: string}).message).toEqual(`invalid "requestedType" bogus`);

    const noAccount = await restClient.getSyncData({requestedType: SynchronizerType.Issue, filter});
    expect(noAccount.statusCode).toEqual(400);
    expect((noAccount.body as unknown as {message: string}).message).toEqual(`"account" is missing`);
  });

  it(`passes Gitea errors through with their status and retry hint`, async () => {
    const issuesQuery = {page: 1, limit: 50, type: "issues", state: "all"};

    gitea().get(`${repoPath}/issues`).query(issuesQuery).reply(404, {message: "repository does not exist"});
    const notFound = await restClient.getSyncData({account, requestedType: SynchronizerType.Issue, filter});
    expect(notFound.statusCode).toEqual(404);
    expect(notFound.body as unknown as {message: string; tryLater: boolean}).toEqual({
      message: "repository does not exist",
      tryLater: false,
    });

    gitea().get(`${repoPath}/issues`).query(issuesQuery).reply(503, {message: "maintenance"});
    const unavailable = await restClient.getSyncData({account, requestedType: SynchronizerType.Issue, filter});
    expect(unavailable.statusCode).toEqual(503);
    expect(unavailable.body as unknown as {message: string; tryLater: boolean}).toEqual({
      message: "maintenance",
      tryLater: true,
    });
  });
});
