# Operator Handbook

Short command and review lookup. Full external behavior is in [ci-cd.md](ci-cd.md), wrapper behavior in [wrapper-summary.md](wrapper-summary.md), and changing product values in generated [project facts](../engineering/project-facts.md).

## Canonical entrypoints

| Need | Command | Notes |
| --- | --- | --- |
| Read-only context | `npm run qa:preflight` | Accepts `-- --files <paths...>` before a diff exists. |
| Harness/shared-control proof | `npm run qa:release-harness` | Required when the live scope classifier reports executable harness targets. |
| In-progress product proof | `npm run qa:checkpoint` | Focused current-diff gate; does not build or commit. |
| Normal implementation closeout | `npm run qa:closeout -- -m "message"` | Owns checkpoint/build handoff, staging, artifact policy, and commit. |
| Local fast gate | `npm run ci:proof -- [--cpu N] [--memory-mib N] [--workers N]` | Runs Fast PR Gate controls directly in WSL without Docker. It excludes full Vitest and does not prove release readiness. Dirty workspace is diagnostic and non-admissible externally. |
| Local full release gate | `npm run ci:release -- [--cpu N] [--memory-mib N] [--workers N]` | Runs the same composition owner as Release provenance Gate directly in WSL, including heavy audit and mutation profiles. |
| Quick local build bypass | `npm run ci:build` | Runs the project npm build only; it is not a release build, emits no QA proof, and is never accepted for provenance. |
| Local PR bypass proof | `npm run ci:proof -- --pr <number> [resource flags]` | Requires clean `origin/main`, validates exact remote PR authority, posts proof hashes, and never merges. |
| Unpacked release build | `npm run build:release` | Release-mode Vite output only; no typecheck, full QA, or package admission. |
| Package-only debugging | `npm run release:package-only` | Diagnostic packaging; does not replace `ci:proof` or `ci:release`. |
| Extension smoke | `npm run qa:e2e` | Separate Playwright runtime acceptance path. |
| Structural maintenance snapshot | `npm run qa:structural-audit` | Manual report only; never a normal PR or closeout gate. |
| Wrapper statistics | `npm run qa:stats -- [--wrapper <id>] [--task <id>]` | Reads structured local run records. |
| GitHub policy preview/apply | `npm run ci:github:plan` / `npm run ci:github:apply` | Writes a sanitized rollback snapshot before apply. |

The normal local delivery order remains `qa:release-harness` when selected, `qa:checkpoint`, required review, then one `qa:closeout`. Do not repeatedly closeout/commit/push to debug CI: use local `ci:proof` and `ci:release` first.

For a CI-authority bootstrap, finish that local QA/closeout sequence, then require green local `ci:proof` and green local `ci:release`. Merge the bootstrap PR with the native bypass while repository Actions are temporarily disabled, so no workflow or Selectel resource is launched; preserve the settings snapshot and proof digests in the PR and restore Actions immediately. Create the version bump only afterward in a separate PR, then require the external Fast PR Gate and Release provenance Gate before publication. A failure before external rollout restarts the full local sequence. After external rollout has begun, fixes still pass the diff-aware QA flow but may go directly back to the external gates unless they changed gate semantics or need local diagnosis.

## GitHub operations

Ready PRs and pushes to `main` run Fast PR Gate with `SELECTEL_QA_PROFILES`. A PR whose trusted gate-input digest is unchanged and whose every changed path is explicitly non-gate-only derives a candidate-bound reuse receipt from the exact base proof and does not provision Selectel; unknown paths fail closed. Run Release provenance Gate from **Actions → Continuous Integration → Run workflow → release-provenance**; it uses the identically shaped `SELECTEL_RELEASE_PROFILES`. It reuses an exact fast proof when possible, otherwise completes the missing fast controls on the same release VM; full Vitest and release-readiness claims always remain owned by release provenance.

The proof artifact name is `fast-proof-<commit>-<run-id>` or `release-provenance-<commit>-<run-id>`. The job summary contains its URL and exact download command. Proof is uploaded before cleanup. Confirm the cleanup receipt marks the runner registration, VM, VM ports, router interface, router, subnet, network, and volumes deleted before treating the run as complete.

To publish, first create and push a GitHub-verifiable annotated signing tag matching the package version. Then run **Actions → Continuous Deployment** with that tag and the successful Release provenance run ID. Deployment creates no VM and performs no QA rebuild. If publication fails, rerun deployment against the same provenance proof.

Selecting an older successful provenance run requires `allow_non_latest_provenance` and a non-empty `bypass_reason`. Local PR bypass likewise leaves its proof digest in the PR; merge remains a manual native GitHub bypass.

## Local WSL setup

Ordinary local `ci:proof` and `ci:release` do not require Docker. They restore the repository-local npm download cache, still run exact `npm ci` plus native package bootstrap, and execute the same JS composition and QA owners directly with the locked external audit binaries. This is the fastest diagnostic path, not byte-for-byte environment equivalence. The GitHub job adds the pinned Linux image and is the canonical release-provenance environment; use the clean `ci:proof -- --pr` container bypass when external-environment equivalence is required locally.

`ci:proof` and `ci:release` are repository-wide in both environments. Diff awareness belongs only to `qa:release-harness`, `qa:checkpoint`, and `qa:closeout`; resource flags affect scheduling and reuse compatibility, never the selected control or file scope.

Docker is required only when explicitly reproducing the external image or running the clean PR bypass mode. With Docker Desktop, enable WSL integration for this distribution and verify `docker version` before bypass proof.

Use `--cpu`, `--memory-mib`, and `--workers` only for measured local limits. They override the corresponding existing resource environment values and remain clamped to WSL-visible resources. GitHub gets all five worker/resource values from the selected Selectel profile.

Missing external audit binaries, their locked query packs, or browser dependencies fail the local full gate. Repair the WSL toolchain rather than treating a partial run as proof.

## Review skills

| Skill | Use |
| --- | --- |
| Security Code Review | Privilege, trust, privacy, secrets, publication, infrastructure credentials, sanitization, and manifest risk. |
| Architecture Code Review | Runtime ownership, contracts, state authority, parser, UI/i18n/design-system, and notable topology. |
| Topology Plan Review | Large owner/path move planning or independent review of a completed topology wave. |
| Repo Audit | Explicit whole-repository audit only. |

Required closeout review runs after the coherent candidate and applicable harness/checkpoint proof are green. Collect all findings before editing, classify them against the frozen acceptance criteria, then apply one consolidated correction.

## Focused debugging

Use direct commands only to diagnose the failed owner:

| Area | Command |
| --- | --- |
| Documentation facts | `node tooling/qa/core/verify-documentation-facts.mjs` |
| Config baseline | `node tooling/qa/core/verify-config-policy.mjs` |
| Typecheck | `node tooling/qa/core/verify-typecheck.mjs` |
| ESLint | `node tooling/qa/core/verify-eslint.mjs` |
| Build | `node tooling/qa/core/verify-build.mjs` |
| Security guardrails | `node tooling/qa/guards/security/verify-security.mjs` |
| Runtime boundaries | `node tooling/qa/guards/architecture/verify-boundaries.mjs` |
| Runtime topology | `node tooling/qa/guards/architecture/verify-runtime-topology.mjs` |
| Manifest permissions | `node tooling/qa/guards/architecture/verify-manifest-permissions.mjs` |
| Task artifacts | `node tooling/qa/core/verify-task-artifacts.mjs` |

Treat DNS, proxy, TLS, registry, browser dependency, Docker engine, and missing binary failures as environment failures. Do not manually stage a closeout candidate or stage `tasks/**`.
