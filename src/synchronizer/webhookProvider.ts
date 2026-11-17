import crypto from "node:crypto";
import {config} from "../config.js";
import {createGiteaApi, GiteaComment, GiteaIssue, GiteaRepository, normalizeBaseUrl} from "../api/gitea.js";
import {logger} from "../infra/logger.js";
import {ValidationError} from "../errors/errors.js";
import {IntegrationAccount} from "../types/types.authentication.js";
import {
  SynchronizerDataFilter,
  WebhookInstallRequestBody,
  WebhookPreProcessRequestBody,
  WebhookTransformRequestBody,
} from "../types/types.requests.js";
import {SynchronizerType} from "../types/types.synchronizerConfig.js";
import {fetchPullRequest} from "./dataProviders/pullRequest.js";
import {transformIssue} from "./dataProviders/issue.js";
import {transformComment} from "./dataProviders/comment.js";

type Row = Record<string, unknown> & {__syncAction: "SET"};
type WebhookData = Partial<Record<SynchronizerType, Row[]>>;

/** A Fibery workspace is identified by the Gitea instance host: events carry `repository.html_url`. */
const hostOf = (url?: string): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host.toLowerCase();
  } catch {
    return undefined;
  }
};

export const installWebhook = ({account, webhook}: WebhookInstallRequestBody) => {
  if (!account?.baseUrl) {
    throw new ValidationError(`"account" is missing`);
  }
  const workspaceId = hostOf(normalizeBaseUrl(account.baseUrl));
  if (!workspaceId) {
    throw new ValidationError(`"${account.baseUrl}" is not a valid URL`);
  }
  return {...(webhook ?? {}), id: webhook?.id ?? crypto.randomUUID(), workspaceId};
};

const lookup = (headers: Record<string, unknown> | undefined, name: string): string | undefined => {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === name) {
      return Array.isArray(value) ? String(value[0]) : value == null ? undefined : String(value);
    }
  }
  return undefined;
};

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

/**
 * Accepts the delivery when it carries the shared secret, either as the webhook's
 * Authorization header (`Bearer <secret>` or the bare secret) or as a valid
 * `X-Gitea-Signature` HMAC. The HMAC can only be checked when Fibery forwards the
 * body as the original string. With no secret configured everything is accepted:
 * the transform step re-reads data from the Gitea API and never trusts the payload.
 */
export const isAuthentic = (
  headers: Record<string, unknown> | undefined,
  rawBody: unknown,
  secret = config.webhookSecret,
): boolean => {
  if (!secret) {
    return true;
  }
  const authorization = lookup(headers, "authorization");
  if (authorization && (safeEqual(authorization, `Bearer ${secret}`) || safeEqual(authorization, secret))) {
    return true;
  }
  const signature =
    lookup(headers, "x-gitea-signature") ?? lookup(headers, "x-hub-signature-256")?.replace(/^sha256=/, "");
  if (signature && typeof rawBody === "string") {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return safeEqual(signature.toLowerCase(), expected);
  }
  return false;
};

const parsePayload = (payload: unknown): Record<string, unknown> => {
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
};

export const preProcessWebhook = (req: WebhookPreProcessRequestBody) => {
  const headers = req.headers ?? req.params;
  const rawBody = req.body ?? req.payload;
  if (!isAuthentic(headers, rawBody)) {
    return {statusCode: 401, body: {reply: {message: "Invalid webhook credentials"}, workspaceIds: [] as string[]}};
  }
  const repository = parsePayload(rawBody).repository as GiteaRepository | undefined;
  const workspaceId = hostOf(repository?.html_url);
  return {statusCode: 200, body: {reply: {}, workspaceIds: workspaceId ? [workspaceId] : []}};
};

type EventPayload = {
  action?: string;
  sha?: string;
  repository?: GiteaRepository;
  pull_request?: {number?: number};
  number?: number;
  issue?: GiteaIssue & {pull_request?: unknown};
  is_pull?: boolean;
  comment?: GiteaComment;
};

const selected = (filter: Partial<SynchronizerDataFilter> | undefined, repoFullName: string): boolean => {
  const repos = filter?.repositories ?? [];
  return repos.some((r) => r.toLowerCase() === repoFullName.toLowerCase());
};

/**
 * Turns a Gitea event into rows. Pull requests are always re-read from the API
 * (reviews and CI status are not in the event) so a row is complete and fresh.
 * Handled: pull_request* events, `status` (CI), `issues`, `issue_comment`.
 */
export const transformWebhook = async ({payload, types, filter, account}: WebhookTransformRequestBody) => {
  if (!account) {
    throw new ValidationError(`"account" is missing`);
  }
  const event = parsePayload(payload) as EventPayload;
  const repoFullName = event.repository?.full_name;
  const data: WebhookData = {};
  if (!repoFullName || !selected(filter, repoFullName)) {
    return {data};
  }
  const wants = (type: SynchronizerType) => !types || types.includes(type);
  const [owner, repo] = repoFullName.split("/");
  const gitea = createGiteaApi(account as IntegrationAccount);
  const add = (type: SynchronizerType, row: object) => {
    (data[type] ??= []).push({...row, __syncAction: "SET"} as Row);
  };

  const pullNumbers = new Set<number>();
  if (event.pull_request?.number !== undefined) {
    pullNumbers.add(event.pull_request.number);
  } else if (event.issue && (event.issue.pull_request || event.is_pull)) {
    pullNumbers.add(event.issue.number);
  } else if (event.sha && !event.issue) {
    for (const pr of await gitea.findOpenPullRequestsBySha(owner, repo, event.sha)) {
      pullNumbers.add(pr.number);
    }
  } else if (event.issue) {
    if (wants(SynchronizerType.Issue)) {
      add(SynchronizerType.Issue, transformIssue(event.issue, repoFullName));
    }
  }

  if (event.comment && event.action !== "deleted" && wants(SynchronizerType.Comment)) {
    add(SynchronizerType.Comment, transformComment(withIssueUrl(event), repoFullName));
  }

  if (wants(SynchronizerType.PullRequest)) {
    for (const number of pullNumbers) {
      add(SynchronizerType.PullRequest, await fetchPullRequest(gitea, owner, repo, repoFullName, number));
    }
  }

  logger.info(
    `webhook ${repoFullName}: ${
      Object.entries(data)
        .map(([t, rows]) => `${t}=${rows?.length}`)
        .join(", ") || "nothing to sync"
    }`,
  );
  return {data};
};

/** Comment payloads omit the parent urls Gitea puts on API comments; rebuild them from the event. */
const withIssueUrl = (event: EventPayload): GiteaComment => {
  const comment = event.comment as GiteaComment;
  const isPull = Boolean(event.issue?.pull_request || event.is_pull);
  const number = event.issue?.number;
  if (comment.issue_url || number === undefined) {
    return comment;
  }
  const url = `${event.repository?.html_url ?? ""}/${isPull ? "pulls" : "issues"}/${number}`;
  return {...comment, issue_url: url, pull_request_url: isPull ? url : undefined};
};
