# Operator Handbook

Short command and review lookup. Full external behavior is in [ci-cd.md](ci-cd.md), wrapper behavior in [wrapper-summary.md](wrapper-summary.md), and changing product values in generated [project facts](../engineering/project-facts.md).

## Canonical entrypoints

| Need | Command | Notes |
| --- | --- | --- |
| Read-only context | `npm run qa:preflight` | Accepts `-- --files <paths...>` before a diff exists. |
| Harness/shared-control proof | `npm run qa:release-harness` | Required when the live scope classifier reports executable harness targets. |
| In-progress product proof | `npm run qa:checkpoint` | Focused current-diff gate; does not build or commit. |
| Normal implementation closeout | `npm run qa:closeout -- -m "message"` | Owns checkpoint/build handoff, staging, artifact policy, and commit. |
| Local fast gate | `npm run ci:proof -- [--cpu N] [--memory-mib N] [--workers N]` | Runs repository-wide Fast controls, full Vitest, fast PR audits, and one fresh `npm run build:release` without archive or reusable build proof. Dirty workspace is diagnostic and non-admissible externally. |
| Local full release gate | `npm run ci:release -- [--cpu N] [--memory-mib N] [--workers N]` | Runs the same blocking composition owner as Release provenance Gate directly in WSL, including the separate release build/archive and heavy audit. CI collects mutation separately as advisory evidence after sealing. |
| Quick local build bypass | `npm run ci:build` | Runs the project npm build only; it is not a release build, emits no QA proof, and is never accepted for provenance. |
| Ordinary unpacked build | `npm run build` | Production-mode Vite build only; no typecheck, QA proof, packaging, or build source maps. |
| Local PR bypass proof | `npm run ci:proof -- --pr <number> --reason "<audit note>" [resource flags]` | Requires clean `origin/main`, validates exact remote PR authority, posts proof hashes and the mandatory reason, and never merges. |
| Unpacked release build | `npm run build:release` | Release-mode Vite output only; no typecheck, full QA, or package admission. |
| Package-only debugging | `npm run release:package-only` | Diagnostic packaging; does not replace `ci:proof` or `ci:release`. |
| Extension smoke | `npm run qa:e2e` | Separate Playwright runtime acceptance path. |
| Structural maintenance snapshot | `npm run qa:structural-audit` | Manual report only; never a normal PR or closeout gate. |
| Wrapper statistics | `npm run qa:stats -- [--wrapper <id>] [--task <id>]` | Reads structured local run records. |
| GitHub policy preview/apply | `npm run ci:github:plan` / `npm run ci:github:apply` | Writes a sanitized rollback snapshot before apply. |

The normal local delivery order remains `qa:release-harness` when selected, `qa:checkpoint`, required review, then one `qa:closeout`. Do not repeatedly closeout/commit/push to debug CI: use local `ci:proof` and `ci:release` first.

Typecheck and artifact construction are independent owners. `npm run build`, `npm run ci:build`, and `npm run build:release` invoke Vite without an embedded typecheck; blocking QA and CI compositions schedule Typecheck before Build explicitly. Production and release builds omit source maps. The dedicated E2E build modes retain source maps for diagnostics.

QA implementation, owner maps, generated inventories, and product code may change together in one ordinary PR. Candidate QA executes once under the trusted-base envelope; no separate bootstrap PR is required. The GitHub summary must show `QA controls changed` and both candidate and trusted control digests. Review QA changes normally and remember that the envelope proves phase, identity, schema, hash, execution, artifact, and graph completeness but does not rerun the previous controls. The accepted implementation becomes trusted only after merge to `main`.

## GitHub operations

Ready PRs run Fast PR Gate with `SELECTEL_QA_PROFILES`. A merge to `main` does not repeat that gate for the squash commit. A PR whose trusted gate-input digest is unchanged and whose every changed path is explicitly non-gate-only derives a candidate-bound reuse receipt from the exact base proof and does not provision Selectel; unknown paths fail closed. Run Release provenance Gate from **Actions → Release provenance → Run workflow**; it uses the identically shaped `SELECTEL_RELEASE_PROFILES`, creates the canonical `main` proof, publishes the admitted immutable images, publishes admitted coverage, and attests the exact release subjects. It reuses an exact fast proof when possible, otherwise completes the missing Fast controls on the same release VM. Full Vitest belongs to Fast proof; release readiness additionally requires the release-only controls.

The proof artifact name is `fast-proof-<commit>-<run-id>-<producer-attempt>` or `release-provenance-<commit>-<run-id>-<producer-attempt>`. The job summary contains its URL and exact download command. A failed downstream-job retry discovers the highest live producer attempt from the run artifact inventory and does not rerun a green VM merely because the consumer attempt changed. Proof is uploaded before cleanup. Confirm the cleanup receipt marks the runner registration, VM, VM ports, disposable security group, router interface, router, subnet, network, and volumes deleted before treating the run as complete. When the early receipt is unavailable, the cleanup artifact must identify `recover-cleanup` for the exact run attempt rather than a repository-wide sweep. The independent daily TTL sweep is recovery, not the normal cleanup path.

To recover one interrupted historical attempt without provisioning another runner, dispatch **Actions → Selectel maintenance → Run workflow** from `main`, select `recover`, and supply its exact GitHub run ID and run attempt. This mode builds only the controller from the dispatched `main` commit, discovers resources by the bound run identity, deletes the complete lifecycle set, and uploads a recovery receipt. It cannot build a QA image or enter the proof graph.

To publish, first create and push a GitHub-verifiable annotated signing tag matching the package version. Then run **Actions → Continuous Deployment** with that tag, the successful Release provenance run ID, and product-facing Markdown for the release highlights and compatibility notes. The workflow supplies the stable introduction, install instructions, and alpha warning. Deployment creates no VM and performs no QA rebuild. If publication fails, rerun deployment against the same provenance proof and notes.

Selecting an older successful provenance run requires `allow_non_latest_provenance` and a non-empty `bypass_reason`. Local PR bypass likewise leaves its proof digest and reason in the PR; merge remains a manual native GitHub bypass. Use bypass only for an external-capacity failure or incident, never as the routine path for QA-control evolution.

Before publication, dispatch Continuous Deployment on `main` with `diagnostic: true`, the signed tag, release notes, and the exact successful provenance run. Require the `Continuous Deployment diagnostic Gate` to pass and inspect its preserved deployment artifact. Diagnostic mode performs the real read-only admission and preparation but cannot enter `release-publisher` or mutate GitHub Releases. Publish with the same inputs only after that diagnostic is green.

For the one-time CI bootstrap, open the PR as draft, add `ci-local-proof-bypass`, and only then mark it ready. Confirm that the labeled PR graph has no executing jobs before merge. There is no `push main` gate trigger, so the resulting squash commit cannot reserve the Selectel pool; after merge, remove the label or dispatch `selectel-smoke` as needed.

## Local WSL setup

Ordinary local `ci:proof` and `ci:release` do not require Docker. They restore the repository-local npm download cache, still run exact `npm ci`, verify every installed project-toolchain package, alias, native entrypoint, and TypeScript compiler-API runtime against `toolchain.lock.json`, then perform native package bootstrap and execute the same JS composition and QA owners with the locked external audit binaries. This is the fastest diagnostic path, not byte-for-byte environment equivalence. The GitHub job adds the pinned Linux image and is the canonical release-provenance environment; use the clean `ci:proof -- --pr <number> --reason "<audit note>"` container bypass when external-environment equivalence is required locally.

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
| Documentation facts | `node tooling/qa/policy/documentation/documentation-facts/documentation-facts.mjs` |
| Config baseline | `node tooling/qa/guards/product-contracts/config/config-policy/check.mjs` |
| Extension build layout | `node tooling/qa/guards/product-contracts/extension-build/verify-extension-build-layout.mjs` |
| Typecheck | `node tooling/qa/proof/typecheck/execution/check.mjs` |
| Tooling coverage (separate maintenance proof) | `node tooling/qa/proof/unit/verify-unit-tests.mjs --suite harness --coverage` |
| Oxlint | `node tooling/qa/guards/quality/verify-oxlint.mjs` |
| Oxfmt | `node tooling/qa/guards/quality/verify-oxfmt.mjs` |
| Unified ast-grep syntax scan | `node tooling/qa/audits/ast-grep/ast-grep.mjs` |
| Security and syntax-only SonarJS Oxlint JS-plugin rules | `node tooling/qa/guards/quality/verify-oxlint.mjs` |
| Release-only type-aware SonarJS ESLint residual | `node tooling/qa/guards/quality/sonarjs/check.mjs` |
| Build | `node tooling/qa/composition/build/build-step.mjs` |
| HTML sanitizer ownership residual | `node tooling/qa/guards/security/html-sanitizer-ownership/check.mjs` |
| jscpd 5 release audit | `node tooling/qa/audits/jscpd/check.mjs` |
| Runtime boundaries | `node tooling/qa/guards/architecture/verify-boundaries.mjs` |
| Runtime topology | `node tooling/qa/guards/architecture/runtime-topology/check.mjs` |
| Manifest permissions | `node tooling/qa/guards/architecture/manifest-permissions/check.mjs` |
| Task artifacts | `node tooling/qa/composition/closeout/verify-task-artifacts.mjs` |

Treat DNS, proxy, TLS, registry, browser dependency, Docker engine, and missing binary failures as environment failures. Do not manually stage a closeout candidate or stage `tasks/**`.

Tooling coverage writes its report to `.tmp/coverage/tooling` and enforces one repository-wide floor for statements, branches, functions, and lines. It is intentionally independent from `ci:release`, product coverage, release provenance, and the public wrapper composition.
