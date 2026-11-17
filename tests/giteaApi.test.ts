import nock from "nock";
import {describe, expect, it} from "vitest";
import {createGiteaApi, normalizeBaseUrl} from "../src/api/gitea.js";
import {AppError} from "../src/errors/errors.js";
import {createTestAccount, TEST_BASE_URL} from "./mocks/testAccount.js";

const gitea = () => nock(TEST_BASE_URL);
const api = createGiteaApi(createTestAccount());
const issuesPath = `/api/v1/repos/octo/repo1/issues`;
const listIssues = (page: number) => api.getIssues({owner: "octo", repo: "repo1", page, limit: 50, type: "issues"});
const items = (n: number, make: (i: number) => object = (i) => ({id: i, number: i, title: `t${i}`})) =>
  Array.from({length: n}, (_, i) => make(i + 1));

describe(`normalizeBaseUrl`, () => {
  it.each([
    ["gitea.test", "https://gitea.test"],
    [" https://gitea.test/ ", "https://gitea.test"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["https://gitea.test/api/v1", "https://gitea.test"],
    ["https://gitea.test/api/v1/", "https://gitea.test"],
    ["gitea.test/git/api/v1", "https://gitea.test/git"],
  ])(`normalizes %j to %j`, (input, expected) => {
    expect(normalizeBaseUrl(input)).toEqual(expected);
  });
});

describe(`request errors and headers`, () => {
  it(`sends the token authorization and JSON accept headers`, async () => {
    nock(TEST_BASE_URL, {reqheaders: {authorization: "token test-token", accept: "application/json"}})
      .get(`/api/v1/user`)
      .reply(200, {id: 1, login: "octocat"});

    await expect(api.validate()).resolves.toEqual({id: 1, login: "octocat"});
  });

  it(`maps 429 to a retryable error carrying the Gitea message`, async () => {
    gitea().get(`/api/v1/repos/octo/repo1`).reply(429, {message: "slow down"});

    await expect(api.getRepository("octo", "repo1")).rejects.toMatchObject({
      statusCode: 429,
      tryLater: true,
      message: "slow down",
    });
  });

  it(`maps a 503 with a non-JSON body to a retryable error with a generic message`, async () => {
    gitea().get(`/api/v1/repos/octo/repo1`).reply(503, "<html>Bad gateway</html>", {"content-type": "text/html"});

    await expect(api.getRepository("octo", "repo1")).rejects.toMatchObject({
      statusCode: 503,
      tryLater: true,
      message: "Gitea API request failed with status 503",
    });
  });

  it(`maps 404 to a non-retryable error carrying the Gitea message`, async () => {
    gitea().get(`/api/v1/repos/octo/repo1`).reply(404, {message: "not found"});

    await expect(api.getRepository("octo", "repo1")).rejects.toMatchObject({
      statusCode: 404,
      tryLater: false,
      message: "not found",
    });
  });

  it(`maps 401 to a non-retryable error`, async () => {
    gitea().get(`/api/v1/repos/octo/repo1`).reply(401, {message: "token is invalid"});

    await expect(api.getRepository("octo", "repo1")).rejects.toMatchObject({statusCode: 401, tryLater: false});
  });

  it(`maps a network failure to a retryable 502`, async () => {
    gitea().get(`/api/v1/repos/octo/repo1`).replyWithError("socket hang up");

    const error = await api.getRepository("octo", "repo1").then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({statusCode: 502, tryLater: true});
    expect((error as AppError).message).toContain("Unable to reach Gitea instance");
  });

  it(`helper endpoints: getAssignees tolerates 404 and non-arrays, getCommitStatus returns null on 404`, async () => {
    const assigneesPath = `/api/v1/repos/octo/repo1/assignees`;
    const statusPath = `/api/v1/repos/octo/repo1/commits/abc/status`;

    gitea().get(assigneesPath).reply(404, {message: "no issues here"});
    await expect(api.getAssignees({owner: "octo", repo: "repo1"})).resolves.toEqual([]);

    gitea().get(assigneesPath).reply(200, {});
    await expect(api.getAssignees({owner: "octo", repo: "repo1"})).resolves.toEqual([]);

    gitea()
      .get(assigneesPath)
      .reply(200, [{id: 1, login: "a"}]);
    await expect(api.getAssignees({owner: "octo", repo: "repo1"})).resolves.toEqual([{id: 1, login: "a"}]);

    gitea().get(assigneesPath).reply(500, {message: "boom"});
    await expect(api.getAssignees({owner: "octo", repo: "repo1"})).rejects.toMatchObject({
      statusCode: 500,
      tryLater: true,
    });

    gitea().get(statusPath).reply(404, {message: "not found"});
    await expect(api.getCommitStatus("octo", "repo1", "abc")).resolves.toBeNull();

    gitea().get(statusPath).reply(500, {message: "boom"});
    await expect(api.getCommitStatus("octo", "repo1", "abc")).rejects.toMatchObject({statusCode: 500});
  });
});

describe(`pagination (hasNext)`, () => {
  it.each([
    ["total header, middle page 1", 50, {"x-total-count": "120"}, 1, true],
    ["total header, middle page 2", 50, {"x-total-count": "120"}, 2, true],
    ["total header, last page", 20, {"x-total-count": "120"}, 3, false],
    ["total exactly one page", 50, {"x-total-count": "50"}, 1, false],
    ["no header, full page", 50, undefined, 1, true],
    ["no header, short page", 49, undefined, 1, false],
    ["no header, empty", 0, undefined, 1, false],
    ["unparsable header, full page", 50, {"x-total-count": "abc"}, 1, true],
  ])(`%s`, async (_name, count, headers, page, expected) => {
    gitea().get(issuesPath).query(true).reply(200, items(count), headers);

    const result = await listIssues(page);

    expect(result.hasNext).toBe(expected);
    expect(result.list).toHaveLength(count);
  });

  it(`non-array body yields an empty list and no next page`, async () => {
    gitea().get(issuesPath).query(true).reply(200, {});

    const result = await listIssues(1);

    expect(result.hasNext).toBe(false);
    expect(result.list).toEqual([]);
  });

  it(`getPullReviews walks every page`, async () => {
    const reviewsPath = `/api/v1/repos/octo/repo1/pulls/9/reviews`;
    const review = (i: number) => ({id: i, user: {id: 1}, state: "COMMENT"});
    gitea().get(reviewsPath).query({page: 1, limit: 50}).reply(200, items(50, review), {"x-total-count": "60"});
    gitea()
      .get(reviewsPath)
      .query({page: 2, limit: 50})
      .reply(
        200,
        Array.from({length: 10}, (_, i) => review(i + 51)),
        {"x-total-count": "60"},
      );

    const reviews = await api.getPullReviews("octo", "repo1", 9);

    expect(reviews).toHaveLength(60);
  });

  it(`findOpenPullRequestsBySha finds a match on page 2`, async () => {
    const pullsPath = `/api/v1/repos/octo/repo1/pulls`;
    gitea()
      .get(pullsPath)
      .query({page: 1, limit: 50, state: "open"})
      .reply(
        200,
        items(50, (i) => ({number: i, head: {sha: "other"}})),
        {"x-total-count": "60"},
      );
    gitea()
      .get(pullsPath)
      .query({page: 2, limit: 50, state: "open"})
      .reply(
        200,
        Array.from({length: 10}, (_, i) => ({
          number: i === 4 ? 99 : 100 + i,
          head: {sha: i === 4 ? "target" : "other"},
        })),
        {"x-total-count": "60"},
      );

    const matches = await api.findOpenPullRequestsBySha("octo", "repo1", "target");

    expect(matches).toHaveLength(1);
    expect(matches[0].number).toBe(99);
  });

  it(`findOpenPullRequestsBySha stops after 20 pages`, async () => {
    let calls = 0;
    gitea()
      .get(`/api/v1/repos/octo/repo1/pulls`)
      .query(true)
      .times(25)
      .reply(
        200,
        () => {
          calls += 1;
          return items(50, (i) => ({number: i, head: {sha: "other"}}));
        },
        {"x-total-count": "100000"},
      );

    await expect(api.findOpenPullRequestsBySha("octo", "repo1", "target")).resolves.toEqual([]);
    // matches MAX_OPEN_PR_PAGES in src/api/gitea.ts
    expect(calls).toBe(20);
  });
});
