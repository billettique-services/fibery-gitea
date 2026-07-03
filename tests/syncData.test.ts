import nock from "nock";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import {getRestClient} from "./restClient.js";
import {createTestApp} from "./testApp.js";
import {createTestAccount, TEST_BASE_URL} from "./mocks/testAccount.js";
import {SynchronizerType} from "../src/types/types.synchronizerConfig.js";

describe(`POST /api/v1/synchronizer/data`, () => {
  let app: ReturnType<typeof createTestApp>;
  let restClient: ReturnType<typeof getRestClient>;
  const account = createTestAccount();
  const gitea = () => nock(TEST_BASE_URL);

  beforeAll(async () => {
    app = createTestApp();
    restClient = getRestClient(app.url);
  });

  afterEach(() => nock.cleanAll());
  afterAll(async () => app.destroy());

  describe(`repositories`, () => {
    it(`fetches each selected repository and paginates across them`, async () => {
      gitea()
        .get(`/api/v1/repos/octo/repo1`)
        .reply(200, {id: 1, name: "repo1", full_name: "octo/repo1", stars_count: 5, owner: {id: 10, login: "octo"}});

      const res1 = await restClient.getSyncData({
        account,
        requestedType: SynchronizerType.Repository,
        filter: {repositories: ["octo/repo1", "octo/repo2"]},
      });

      expect(res1.statusCode).toEqual(200);
      expect(res1.body.items).toEqual([
        expect.objectContaining({id: "octo/repo1", name: "octo/repo1", stars_count: 5, owner_id: "10"}),
      ]);
      expect(res1.body.pagination).toEqual({hasNext: true, nextPageConfig: {repos: ["octo/repo2"], page: 1}});
      expect(res1.body.synchronizationType).toEqual("full");

      gitea()
        .get(`/api/v1/repos/octo/repo2`)
        .reply(200, {id: 2, name: "repo2", full_name: "octo/repo2"});

      const res2 = await restClient.getSyncData({
        account,
        requestedType: SynchronizerType.Repository,
        filter: {repositories: ["octo/repo1", "octo/repo2"]},
        pagination: {repos: ["octo/repo2"], page: 1},
      });

      expect(res2.body.items).toEqual([expect.objectContaining({id: "octo/repo2"})]);
      expect(res2.body.pagination).toEqual({hasNext: false});
    });
  });

  describe(`issues`, () => {
    it(`returns only real issues keyed by owner/repo#number`, async () => {
      gitea()
        .get(`/api/v1/repos/octo/repo1/issues`)
        .query({page: 1, limit: 50, type: "issues", state: "all"})
        .reply(200, [
          {id: 100, number: 7, title: "A bug", state: "open", user: {id: 10}, labels: [{id: 3}], comments: 2},
          {id: 101, number: 8, title: "A PR disguised as issue", state: "open", pull_request: {merged: false}},
        ]);

      const res = await restClient.getSyncData({
        account,
        requestedType: SynchronizerType.Issue,
        filter: {repositories: ["octo/repo1"]},
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.items).toEqual([
        expect.objectContaining({
          id: "octo/repo1#7",
          name: "A bug",
          number: 7,
          state: "Open",
          repository_id: "octo/repo1",
          author_id: "10",
          label_ids: ["3"],
          comments_count: 2,
        }),
      ]);
      expect(res.body.pagination).toEqual({hasNext: false});
    });

    it(`treats a null lastSynchronizedAt as a full sync (no since param)`, async () => {
      gitea()
        .get(`/api/v1/repos/octo/repo1/issues`)
        .query({page: 1, limit: 50, type: "issues", state: "all"})
        .reply(200, [{id: 100, number: 7, title: "First sync", state: "open"}]);

      const res = await restClient.getSyncData({
        account,
        requestedType: SynchronizerType.Issue,
        filter: {repositories: ["octo/repo1"]},
        // Fibery sends null on the very first synchronization
        lastSynchronizedAt: null as unknown as string,
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.synchronizationType).toEqual("full");
      expect(res.body.items[0]).toMatchObject({id: "octo/repo1#7"});
    });

    it(`performs delta sync using the since parameter`, async () => {
      const since = "2026-06-01T00:00:00.000Z";
      gitea()
        .get(`/api/v1/repos/octo/repo1/issues`)
        .query({page: 1, limit: 50, type: "issues", state: "all", since})
        .reply(200, [{id: 100, number: 7, title: "Recent", state: "closed"}]);

      const res = await restClient.getSyncData({
        account,
        requestedType: SynchronizerType.Issue,
        filter: {repositories: ["octo/repo1"]},
        lastSynchronizedAt: since,
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.synchronizationType).toEqual("delta");
      expect(res.body.items[0]).toMatchObject({id: "octo/repo1#7", state: "Closed"});
    });
  });

  describe(`pull requests`, () => {
    it(`lists via the issues endpoint then enriches each pull request`, async () => {
      gitea()
        .get(`/api/v1/repos/octo/repo1/issues`)
        .query({page: 1, limit: 50, type: "pulls", state: "all"})
        .reply(200, [{id: 200, number: 12, title: "Feature", pull_request: {merged: true}}]);

      gitea()
        .get(`/api/v1/repos/octo/repo1/pulls/12`)
        .reply(200, {
          id: 200,
          number: 12,
          title: "Feature",
          state: "closed",
          merged: true,
          base: {ref: "main"},
          head: {ref: "feature"},
          user: {id: 10},
        });

      const res = await restClient.getSyncData({
        account,
        requestedType: SynchronizerType.PullRequest,
        filter: {repositories: ["octo/repo1"]},
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.items).toEqual([
        expect.objectContaining({
          id: "octo/repo1#12",
          state: "Merged",
          merged: true,
          base_branch: "main",
          head_branch: "feature",
          repository_id: "octo/repo1",
        }),
      ]);
    });
  });

  describe(`comments`, () => {
    it(`links comments to their issue or pull request`, async () => {
      gitea()
        .get(`/api/v1/repos/octo/repo1/issues/comments`)
        .query({page: 1, limit: 50})
        .reply(200, [
          {id: 500, body: "on issue", issue_url: "https://gitea.test/api/v1/repos/octo/repo1/issues/7", user: {id: 10}},
          {
            id: 501,
            body: "on pr",
            issue_url: "https://gitea.test/api/v1/repos/octo/repo1/issues/12",
            pull_request_url: "https://gitea.test/api/v1/repos/octo/repo1/pulls/12",
          },
        ]);

      const res = await restClient.getSyncData({
        account,
        requestedType: SynchronizerType.Comment,
        filter: {repositories: ["octo/repo1"]},
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.items).toEqual([
        expect.objectContaining({id: "500", issue_id: "octo/repo1#7", author_id: "10"}),
        expect.objectContaining({id: "501", pullrequest_id: "octo/repo1#12"}),
      ]);
      expect((res.body.items[0] as {pullrequest_id?: string}).pullrequest_id).toBeUndefined();
      expect((res.body.items[1] as {issue_id?: string}).issue_id).toBeUndefined();
    });
  });

  describe(`users`, () => {
    it(`merges collaborators and assignees for org repositories`, async () => {
      gitea()
        .get(`/api/v1/repos/octo/repo1/collaborators`)
        .query({page: 1, limit: 50})
        .reply(200, []); // org repo: no direct collaborators

      gitea()
        .get(`/api/v1/repos/octo/repo1/assignees`)
        .reply(200, [
          {id: 10, login: "alice", full_name: "Alice"},
          {id: 11, login: "bob"},
        ]);

      const res = await restClient.getSyncData({
        account,
        requestedType: SynchronizerType.User,
        filter: {repositories: ["octo/repo1"]},
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.items).toEqual([
        expect.objectContaining({id: "10", name: "Alice", login: "alice"}),
        expect.objectContaining({id: "11", name: "bob", login: "bob"}),
      ]);
    });

    it(`deduplicates users present in both collaborators and assignees`, async () => {
      gitea()
        .get(`/api/v1/repos/octo/repo1/collaborators`)
        .query({page: 1, limit: 50})
        .reply(200, [{id: 10, login: "alice", full_name: "Alice"}]);

      gitea()
        .get(`/api/v1/repos/octo/repo1/assignees`)
        .reply(200, [{id: 10, login: "alice", full_name: "Alice"}]);

      const res = await restClient.getSyncData({
        account,
        requestedType: SynchronizerType.User,
        filter: {repositories: ["octo/repo1"]},
      });

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({id: "10"});
    });
  });

  it(`returns empty result when no repositories are selected`, async () => {
    const res = await restClient.getSyncData({
      account,
      requestedType: SynchronizerType.Label,
      filter: {repositories: []},
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.pagination).toEqual({hasNext: false});
  });
});
