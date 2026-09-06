# Operator handbook

This document owns public operator commands and external run procedures. Wrapper semantics belong in [wrapper-summary.md](wrapper-summary.md). External admission policy belongs in [ci-cd.md](ci-cd.md).

## Commands

| Need | Command |
| --- | --- |
| Plan current or explicit paths | `npm run qa:preflight -- [--files <paths...>]` |
| Validate harness/shared controls | `npm run qa:release-harness` |
| Validate the current diff | `npm run qa:checkpoint` |
| Build and commit an accepted diff | `npm run qa:closeout -- -m "message"` |
| Run complete Fast proof | `npm run ci:proof -- [resource flags]` |
| Run release proof | `npm run ci:release -- [resource flags]` |
| Reproduce external Fast proof | `npm run ci:proof:container` |
| Reproduce external release proof | `npm run ci:release:container` |
| Force a cold local install | `npm run ci:proof -- --fresh-install` |
| Run the project build without QA proof | `npm run build` or `npm run ci:build` |
| Build unpacked release output without admission | `npm run build:release` |
| Debug typecheck, build, and packaging | `npm run release:package-only` |
| Run extension smoke | `npm run qa:e2e` |
| Write a non-blocking topology report | `npm run qa:structural-audit` |
| Inspect wrapper records | `npm run qa:stats -- [--wrapper <id>] [--task <id>]` |
| Check dependency freshness without changes | `npm run ci:dependencies:plan` |
| Preview or apply GitHub policy | `npm run ci:github:plan` or `npm run ci:github:apply` |

Resource flags are `--cpu N`, `--memory-mib N`, and `--workers N`. Use them only for measured local limits. They change scheduling and reuse compatibility, not control scope.

`ci:release` requires matching `ci:proof`. `ci:release:container` requires matching `ci:proof:container`.

Follow the [blocking-wrapper rule](wrapper-summary.md#locks-and-scheduling).

## GitHub operations

Ready pull requests run **Continuous Integration**. A merge to `main` does not repeat this gate for the squash commit.

Run **Release provenance** from `main` to create canonical release proof. If a consumer job fails after proof upload, rerun the failed jobs; the workflow selects the latest live producer attempt.

Treat a Selectel run as complete only when its cleanup receipt covers every attempt-owned resource. To recover an interrupted attempt, run **Selectel maintenance**, select `recover`, and provide its run ID and attempt. Do not substitute the daily sweep for exact recovery.

To publish:

1. Create and push a GitHub-verifiable annotated tag matching the package version.
2. Run **Continuous Deployment** with the tag, matching provenance finalizer run ID, and product-facing release notes.
3. Rerun with the same inputs after a publication failure.

Set `allow_non_latest_provenance` and `bypass_reason` only when intentionally selecting an older valid provenance result.

Before merge, a branch `diagnostic: true` run requires the matching provenance diagnostic and defers remote tag and attestation checks. After merge and tag creation, the `main` diagnostic requires the matching provenance finalizer and completes those checks. Diagnostic mode cannot publish.

For exact recovery from unavailable external capacity, run `npm run ci:proof -- --pr <number> --reason "<audit note>" [resource flags]`. The command requires the clean remote PR candidate, posts its evidence, and never merges.

For the no-run CI bootstrap, open a draft PR, apply `ci-local-proof-bypass`, mark it ready, and verify that no PR jobs execute before manual merge.

## Local environment

Native `ci:proof` and `ci:release` do not require Docker. Container proof and the local PR bypass do. Enable Docker Desktop WSL integration and verify `docker version` before either mode.

External audit tools and browser dependencies are mandatory when their selected lane runs. Repair missing tools instead of accepting partial proof.

## Focused diagnostics

Use these commands only after the owning wrapper identifies the failed control. Diagnose from the run log, then rerun the owning wrapper. Do not use repeated commits or external runs for local debugging.

| Control | Command |
| --- | --- |
| Documentation facts | `node tooling/qa/policy/documentation/documentation-facts/documentation-facts.mjs` |
| Config policy | `node tooling/qa/guards/product-contracts/config/config-policy/check.mjs` |
| Typecheck | `node tooling/qa/proof/typecheck/execution/check.mjs` |
| Oxlint | `node tooling/qa/guards/quality/verify-oxlint.mjs` |
| Oxfmt | `node tooling/qa/guards/quality/verify-oxfmt.mjs` |
| Ast-grep | `node tooling/qa/audits/ast-grep/ast-grep.mjs` |
| Build | `node tooling/qa/composition/build/build-step.mjs` |
| Runtime boundaries | `node tooling/qa/guards/architecture/verify-boundaries.mjs` |
| Runtime topology | `node tooling/qa/guards/architecture/runtime-topology/check.mjs` |
| Manifest permissions | `node tooling/qa/guards/architecture/manifest-permissions/check.mjs` |
| Tooling coverage | `node tooling/qa/proof/unit/verify-unit-tests.mjs --suite harness --coverage` |
