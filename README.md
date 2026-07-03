# Gitea Connector for Fibery

A Fibery custom integration that performs one-way sync of data from a [Gitea](https://gitea.com)
instance (self-hosted or cloud) into Fibery.

## What it syncs

The connector creates the following Databases in Fibery:

| Database       | Notes                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Repository     | Selected repositories (metadata, stars/forks/watchers, owner)         |
| Issue          | Real issues only (pull requests are excluded), with delta sync        |
| Pull Request   | Listed via the issues endpoint, enriched with merge/branch metadata   |
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
  `read:repository`, `read:issue`, and `read:user` scopes.

## Filters

- **Repositories** (required) — a multi-select populated from the repositories your token can access
  (`GET /user/repos`). Data for every repository-scoped type is fetched only for the selected repositories.

## Delta sync

Issues, pull requests, and comments are synchronized incrementally using Gitea's `since` (RFC 3339)
parameter. Repositories, milestones, labels, and users are re-fetched in full (these endpoints do not
support `since` and are low volume). Because Gitea's `/pulls` endpoint has no `since` filter, pull
requests are delta-synced through the issues endpoint with `type=pulls`, then enriched via
`/pulls/{index}`.

## Development

```bash
pnpm install    # dependencies (this repo pins node-linker=hoisted in .npmrc)
pnpm build      # compile TypeScript
pnpm lint       # ESLint
pnpm test       # vitest (nock-based, no network)
pnpm start      # build and run the server (default port 3511)
```

## Local Testing

1. Start the server: `pnpm start`
2. Expose it: `ngrok http 3511`
3. In Fibery, add a **Custom Integration** using the ngrok URL.
