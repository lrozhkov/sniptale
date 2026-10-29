# Optional WebDAV E2E

## Scope

WebDAV provider E2E requires Docker Engine, Docker Compose and the normal project Node toolchain. The runner is qualified on Linux and WSL. The required CI/CD pipeline does not require Docker or Nextcloud. The ordinary Playwright configuration excludes `tooling/test/e2e/providers/**`. Checkpoint retains deterministic sync tests and tooling checks without starting containers.

## Run from a fresh checkout

Install project dependencies and the project's Playwright browser first. Run the separate lab command from the repository root:

```sh
npm run qa:e2e:webdav:lab
```

The command builds the security and release extensions. It starts pinned Nextcloud, PostgreSQL and Redis images from their registries. It creates a disposable user and app password without printing credentials. It runs the DB profile and then the Redis profile.

Each profile runs both provider tests and the separate lifecycle/handoff configuration. The Redis profile also runs real Redis outage tests against its exact container identity. The command stops its services after success, failure or an interrupt. It preserves volumes, credentials and run evidence.

Images are not repository files. No custom image build is necessary. Compose caps app memory at 2 GiB, database memory at 512 MiB and Redis memory at 128 MiB. The database and Redis ports remain private. The app binds an ephemeral loopback port. A fresh lab needs additional volume space and does not copy the historical lab volumes.

## Selected runs

```sh
npm run qa:e2e:webdav:lab -- run --profile db
npm run qa:e2e:webdav:lab -- run --profile redis
npm run qa:e2e:webdav:lab -- run --profile all --grep '423|worker restart'
```

Use `--skip-build` only when both extension builds already match current product inputs. A selected pattern can leave one group empty. The default complete run does not permit an empty group. The command preserves a failing result. It does not increase retries or change server criteria. It stops at the first failing group and records incomplete groups in its summary.

## Keep a lab available

```sh
npm run qa:e2e:webdav:lab -- up --profile db
npm run qa:e2e:webdav:lab -- up --profile redis
npm run qa:e2e:webdav:lab -- stop
```

Only a successful `up` leaves services running. Profile changes stop the app before changing its configuration. The initial installer runs before the locking profile enters the writable Nextcloud config directory. The app then restarts before tests use that profile.

The Docker project name contains a hash of the checkout path. Another checkout therefore gets another disposable lab. A local command lock rejects overlapping commands in the same checkout. After a forced process kill, check for a surviving command before removing a stale `runner.lock`.

The runner refuses installation or account password regeneration when existing volumes lack those local secrets. It can issue a missing app password from the retained account password. It never removes volumes. Remove disposable volumes explicitly only when their data is no longer necessary.

## Local state and artifacts

- `.tmp/webdav-lab/.secrets/`: generated passwords, with owner-only access.
- `.tmp/webdav-lab/active.json`: current endpoint, profile and container identity, without credentials.
- `.tmp/webdav-provider-runs/<run>/`: build logs, group logs, browser artifacts and `summary.json`.

All these paths are ignored by Git. The runner does not print or export its app password. Do not upload `.secrets`, browser profiles, storage volumes or complete artifact directories to public CI artifacts. An optional private CI job can retain its sanitized logs and summary under the project's artifact policy. No required workflow invokes this command.

The existing `npm run qa:e2e:webdav` command remains available for an explicitly supplied lab endpoint and secret file. Lifecycle and handoff tests remain in `webdav-lifecycle.config.ts`. The new lab command invokes both configurations.

## Preserved qualification results

[The evidence manifest](webdav-evidence/2026-10-29/manifest.json) preserves the historical R1 qualification at commit `d9e247b5b`. Its tracked text files include DB and Redis results, environment limits, original failures, corrections and final QA/review records. The dated support report remains a JSON data snapshot, separate from active guidance.

The original dual-423 failure remains evidence. It is not a current Nextcloud rejection criterion. The first stale-build runs remain historical and do not replace the later explicit-build results. The metadata-export and owned-empty recovery failures remain beside their successful correction logs.

The manifest records original and archived SHA-256 values. Archiving removes terminal color escapes and replaces the absolute worktree path. JSON whitespace follows the canonical formatter. It does not change test outcomes. Generated images, Docker layers, credentials, volumes and browser profiles are not part of this curated evidence. The historical text evidence therefore travels with Git when this worktree is integrated.

The qualified server was Nextcloud 34.0.5 with PostgreSQL and either DB locks or Redis locking. Authentication used Basic with an app password. The browser used the existing HTTPS test proxy and accepted its lab certificate. This does not establish arbitrary corporate OAuth/SSO compatibility or public TLS trust. The 10,000-item catalog proof is a metadata model, not a physical 50 GiB test. New provider runs do not overwrite this dated evidence set.
