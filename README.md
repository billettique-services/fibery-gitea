# Gitea Connector for Fibery

A Fibery custom integration that performs one-way sync of data from a [Gitea](https://gitea.com)
instance (self-hosted or cloud) into Fibery.

## What it syncs

The connector creates the following Databases in Fibery:

| Database       | Notes                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Repository     | Selected repositories (metadata, open issues count, owner)            |
| Issue          | Real issues only (pull requests are excluded), with delta sync        |
| Pull Request   | Merge/branch metadata, size, review state, CI status                  |
| Milestone      | Per-repository milestones                                             |
| Label          | Per-repository labels                                                 |
| User           | Repository collaborators (upserted by id across repositories)         |
| Comment        | Issue & pull-request comments (off by default), with delta sync       |

Relations wired up between the databases:

- Repository → Issues, Pull Requests, Milestones, Labels, Owned Repositories (User)
- Issue / Pull Request → Repository, Author (User), Assignees (User), Labels, Milestone
- Comment → Author (User), Issue, Pull Request

## Authentication

Token authentication is used. Provide:

- **Gitea URL** — base URL of your instance, e.g. `https://gitea.com` or `https://git.mycompany.io`
- **Access Token** — a personal access token (Settings → Applications) with at least
  `read:repository`, `read:issue`, and `read:user` scopes. Add `write:repository` to use the
  **Create branch** action.

## Filters

- **Repositories** (required) — a multi-select populated from the repositories your token can access
  (`GET /user/repos`). Data for every repository-scoped type is fetched only for the selected repositories.

## Delta sync

Issues, pull requests, and comments are synchronized incrementally using Gitea's `since` (RFC 3339)
parameter. Repositories, milestones, labels, and users are re-fetched in full (these endpoints do not
support `since` and are low volume). Because Gitea's `/pulls` endpoint has no `since` filter, pull
requests are delta-synced through the issues endpoint with `type=pulls`, then enriched via
`/pulls/{index}`, `/pulls/{index}/reviews` and `/commits/{sha}/status`.

Gitea only bumps an issue's `updated_at` for activity on the issue itself, so a CI status change does not
make a pull request show up in a delta sync. Enable [webhooks](#webhooks) to pick those changes up
immediately.

## Pull request fields

- **Head Branch** is read from `head.label`; Gitea turns `head.ref` into `refs/pull/<n>/head` once the
  branch is deleted. For forks the `owner:` prefix is stripped.
- **Additions / Deletions / Changed Files** give the PR size.
- **Review State** is `Changes requested` if any reviewer's latest decision is a change request, else
  `Approved` if anyone approved, else `Pending`. Comment-only reviews do not erase an approval and
  dismissed reviews are ignored. **Approved By** and **Changes Requested By** list the reviewers.
- **CI Status** is the combined status of the head commit: `Success`, `Pending`, `Failure` (also for
  `error`/`warning`) or `None` when no CI reported.

## Webhooks

The synchronizer config enables Fibery webhooks (`webhooks: {enabled: true, type: "ui"}`), implemented by
`POST /api/v1/synchronizer/webhooks`, `/webhooks/pre-process` and `/webhooks/transform`.

1. In Fibery, turn webhooks on for the Gitea sync (Fibery admins only) and copy the webhook URL
   (`https://webhooks-svc.fibery.io/apps/<app-id>`).
2. In Gitea (repository or organization settings → Webhooks) add a **Gitea** webhook with that URL,
   content type `application/json`, and the events *Pull Request* (all variants), *Issues*, *Issue
   Comment* and *Status*.
3. Optional but recommended: set `WEBHOOK_SECRET` on the connector and put the same value in the
   webhook's **Authorization Header** field (`Bearer <secret>`). Without it every delivery is accepted;
   this is low risk because the payload is never stored, only used to decide what to re-read from Gitea.

Events are matched to the sync by the host of the repository URL, so the *Gitea URL* in the integration
account must have the same host as Gitea's `ROOT_URL`. Events for repositories that are not selected in the
sync are ignored. Deletions are not propagated by webhooks; the next full sync handles them.

## Create branch action

The connector exposes **Create branch** through Fibery's external actions API
(`POST /api/v1/automations/action/execute`), using the integration account's token, so automations no
longer need a Gitea token in clear text. Arguments: `repo` (`owner/repo`), `name`, and optional `ref`
(branch, tag or commit; defaults to the repository's default branch). The token needs `write:repository`.

## Development

```bash
pnpm install    # dependencies (this repo pins node-linker=hoisted in .npmrc)
pnpm build      # compile TypeScript
pnpm lint       # ESLint
pnpm typecheck  # tsc over src and tests (no emit)
pnpm verify     # lint + typecheck + tests: run before pushing
pnpm test       # vitest (nock-based, no network)
pnpm start      # build and run the server (default port 3511)
```

## Local Testing

1. Start the server: `pnpm start`
2. Expose it: `ngrok http 3511`
3. In Fibery, add a **Custom Integration** using the ngrok URL.

## Docker

A multi-stage Alpine image is provided (build → production-only runtime, runs as
the non-root `node` user, ~280 MB).

```bash
# Build and run with compose
docker compose up -d --build

# Or with plain docker
docker build -t gitea-fibery-connector .
docker run -d -p 3511:3511 gitea-fibery-connector
```

The container exposes the connector on port `3511` (override with the `PORT` env
var — compose reads it too). A `HEALTHCHECK` polls `/status`. Then expose the port
publicly (e.g. `ngrok http 3511`) and register the URL in Fibery.
