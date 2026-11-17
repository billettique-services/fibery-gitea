import crypto from "node:crypto";
import nock from "nock";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import {createTestApp} from "./testApp.js";
import {createTestAccount, TEST_BASE_URL} from "./mocks/testAccount.js";
import {isAuthentic} from "../src/synchronizer/webhookProvider.js";
import {SynchronizerType} from "../src/types/types.synchronizerConfig.js";

describe(`webhooks`, () => {
  let app: ReturnType<typeof createTestApp>;
  const account = createTestAccount();
  const gitea = () => nock(TEST_BASE_URL);
  const repository = {id: 1, full_name: "octo/repo1", html_url: `${TEST_BASE_URL}/octo/repo1`};
  const filter = {repositories: ["octo/repo1"]};

  beforeAll(() => {
    app = createTestApp();
  });
  afterEach(() => nock.cleanAll());
  afterAll(async () => app.destroy());

  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${app.url}/api/v1/synchronizer/${path}`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
    return {
      statusCode: response.status,
      body: (await response.json()) as Record<string, unknown> & {
        data?: Record<string, Array<Record<string, unknown>>>;
        webhooks?: unknown;
        workspaceId?: string;
        id?: string;
        workspaceIds?: string[];
      },
    };
  };
  const transform = (payload: unknown, types = [SynchronizerType.PullRequest, SynchronizerType.Issue]) =>
    post("webhooks/transform", {payload, types, filter, account});

  it(`advertises webhook support in the synchronizer config`, async () => {
    const res = await post("config", {});
    expect(res.body.webhooks).toEqual({enabled: true, type: "ui"});
  });

  describe(`install`, () => {
    it(`returns a random id and the Gitea host as workspace id`, async () => {
      const res = await post("webhooks", {types: [], filter, account, webhook: null});
      expect(res.statusCode).toEqual(200);
      expect(res.body.workspaceId).toEqual("gitea.test");
      expect(res.body.id).toEqual(expect.any(String));
    });

    it(`keeps the id of an already installed webhook`, async () => {
      const res = await post("webhooks", {types: [], filter, account, webhook: {id: "abc", workspaceId: "old"}});
      expect(res.body).toMatchObject({id: "abc", workspaceId: "gitea.test"});
    });
  });

  describe(`pre-process`, () => {
    it(`routes an event to the workspace of its repository`, async () => {
      const res = await post("webhooks/pre-process", {headers: {}, body: {repository}});
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({reply: {}, workspaceIds: ["gitea.test"]});
    });

    it(`accepts the payload/params spelling and a JSON string body`, async () => {
      const res = await post("webhooks/pre-process", {params: {}, payload: JSON.stringify({repository})});
      expect(res.body.workspaceIds).toEqual(["gitea.test"]);
    });

    it(`returns no workspace when the event has no repository`, async () => {
      const res = await post("webhooks/pre-process", {headers: {}, body: {}});
      expect(res.body.workspaceIds).toEqual([]);
    });
  });

  describe(`authentication`, () => {
    const body = JSON.stringify({a: 1});
    const signature = crypto.createHmac("sha256", "s3cret").update(body).digest("hex");

    it(`accepts everything when no secret is configured`, () => {
      expect(isAuthentic({}, body, "")).toBe(true);
    });
    it(`accepts the secret as Authorization header, case-insensitively named`, () => {
      expect(isAuthentic({Authorization: "Bearer s3cret"}, body, "s3cret")).toBe(true);
      expect(isAuthentic({authorization: "s3cret"}, body, "s3cret")).toBe(true);
    });
    it(`accepts a valid HMAC signature over a string body`, () => {
      expect(isAuthentic({"x-gitea-signature": signature}, body, "s3cret")).toBe(true);
    });
    it(`rejects wrong credentials, a tampered body and missing credentials`, () => {
      expect(isAuthentic({authorization: "Bearer nope"}, body, "s3cret")).toBe(false);
      expect(isAuthentic({"x-gitea-signature": signature}, body + " ", "s3cret")).toBe(false);
      expect(isAuthentic({"x-gitea-signature": signature}, {a: 1}, "s3cret")).toBe(false);
      expect(isAuthentic({}, body, "s3cret")).toBe(false);
    });
  });

  describe(`transform`, () => {
    const mockPullRequest = (number: number, sha = "sha1") => {
      gitea()
        .get(`/api/v1/repos/octo/repo1/pulls/${number}`)
        .reply(200, {
          id: 200,
          number,
          title: "Feature",
          state: "open",
          head: {ref: "feature", label: "feature", sha},
        });
      gitea().get(`/api/v1/repos/octo/repo1/pulls/${number}/reviews`).query({page: 1, limit: 50}).reply(200, []);
      gitea().get(`/api/v1/repos/octo/repo1/commits/${sha}/status`).reply(200, {state: "success", total_count: 1});
    };

    it(`re-reads a pull request touched by a pull_request event`, async () => {
      mockPullRequest(12);
      const res = await transform({action: "synchronized", number: 12, pull_request: {number: 12}, repository});
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.pullrequest).toEqual([
        expect.objectContaining({id: "octo/repo1#12", ci_status: "Success", __syncAction: "SET"}),
      ]);
    });

    it(`re-reads the pull request when a commit status event matches its head sha`, async () => {
      gitea()
        .get(`/api/v1/repos/octo/repo1/pulls`)
        .query({page: 1, limit: 50, state: "open"})
        .reply(200, [
          {number: 1, head: {sha: "other"}},
          {number: 2, head: {sha: "sha2"}},
        ]);
      mockPullRequest(2, "sha2");
      const res = await transform({sha: "sha2", state: "success", repository});
      expect(res.body.data.pullrequest).toHaveLength(1);
      expect(res.body.data.pullrequest[0]).toMatchObject({id: "octo/repo1#2"});
    });

    it(`re-reads the pull request on a comment made on it and emits the comment`, async () => {
      mockPullRequest(5);
      const res = await transform(
        {
          action: "created",
          is_pull: true,
          issue: {number: 5, pull_request: {merged: false}},
          comment: {id: 77, body: "lgtm", user: {id: 3}},
          repository,
        },
        [SynchronizerType.PullRequest, SynchronizerType.Comment],
      );
      expect(res.body.data.pullrequest[0]).toMatchObject({id: "octo/repo1#5"});
      expect(res.body.data.comment).toEqual([
        expect.objectContaining({id: "77", pullrequest_id: "octo/repo1#5", author_id: "3", __syncAction: "SET"}),
      ]);
    });

    it(`transforms issue events straight from the payload`, async () => {
      const res = await transform({
        action: "opened",
        issue: {id: 9, number: 9, title: "Bug", state: "open"},
        repository,
      });
      expect(res.body.data).toEqual({
        issue: [expect.objectContaining({id: "octo/repo1#9", name: "Bug", state: "Open", __syncAction: "SET"})],
      });
    });

    it(`ignores events for repositories that are not selected`, async () => {
      const other = {full_name: "octo/other", html_url: `${TEST_BASE_URL}/octo/other`};
      const res = await transform({number: 1, pull_request: {number: 1}, repository: other});
      expect(res.body).toEqual({data: {}});
    });

    it(`ignores types that are not synchronized`, async () => {
      const res = await transform({number: 1, pull_request: {number: 1}, repository}, [SynchronizerType.Issue]);
      expect(res.body).toEqual({data: {}});
    });

    it(`ignores unrelated events such as push`, async () => {
      const res = await transform({ref: "refs/heads/main", repository});
      expect(res.body).toEqual({data: {}});
    });
  });
});
