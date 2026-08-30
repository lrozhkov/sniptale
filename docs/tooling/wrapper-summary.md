# Wrapper Summary

This document owns wrapper scope, freshness, locks, handoffs, and observability. The canonical implementation order is `implementation → qa:checkpoint → required review → qa:closeout`.

## Diff-local QA

The live scope classifier is `tooling/qa/composition/scope/qa-scope.mjs`.

The canonical control catalog groups internal work into ordered categories from preparation and admission through syntax/semantics, graph/closure, behavioral and release proof, meta-policy, orchestration, and report-only projections. Public wrapper names and contracts stay stable. A wrapper selects a mode from the catalog; compatibility registries adapt execution but do not own a second list or order.

- `qa:preflight` is a read-only current-diff or explicit-file planning snapshot. It does not format, build, acquire the blocking lock, or write proof state.
- `qa:advisory` is optional non-blocking diagnosis over the current diff.
- `qa:structural-audit` is a manual report-only repository maintenance snapshot. It is never a PR or closeout gate.
- `qa:release-harness` uses the same diff-aware Oxfmt write barrier as checkpoint, then proves QA composition integrity, conditional dependency admission and Typecheck, Oxlint, and affected harness tests before writing the freshness stamp consumed by downstream local wrappers.
- `qa:checkpoint` formats supported non-Markdown targets, recollects the diff, verifies required harness freshness, records advisory failure as non-blocking evidence, then runs categorized diff-aware focused lanes for typecheck, tests, lint, graph/index, architecture/security controls, and eligible diff coverage. It does not build, stage, or commit.
- `qa:closeout` reuses or runs checkpoint, hands its lock to the internal build phase, validates unchanged proof scope, stages allowed changes, rejects `tasks/**`, and commits only after green build proof.

The internal build phase is not a public standalone wrapper. Closeout and pre-push invoke the `qa:internal:build` script after fresh checkpoint/harness proof; its observed child-run identity remains `qa:build` for lock handoff and evidence. It selects direct, related, saturated, or full unit scope from the existing deterministic owner and produces a fresh artifact build without writing a reusable local build-state shortcut. `ci:build` is different: it is an explicit quick `npm run build` bypass and makes no canonical QA claim.

Every real full gate performs `npm ci`; cached download bytes never replace dependency installation or exact lockfile validation. The project-local npm policy admits ordinary releases only after seven days and permits legacy peer resolution only for the retained release-only SonarJS ESLint toolchain while its parser has not yet declared compatibility with the compiler-API shim. An urgent security release may use `--min-release-age-exclude` only for the exact evidenced package on one install command; committed exclusions and a global age bypass are forbidden. Npm errors remain visible in the console. Remove the peer exception when that parser accepts the canonical compiler-API package or the lane is retired.

Harness targets include executable `tooling/**`, workflows, hooks, QA-affecting root/package/TypeScript/Vite configuration, and active `docs/tooling/**` guidance. Exact data-only inventories are exempt only when `qa-scope` classifies them as such and their focused owner validator passes. A policy JSON, baseline, allowlist, or executable registry is not data-only.

Within an exact scope, Messaging and Browser-adapter syntax controls project from one ast-grep process and receipt. Logging projects from the one Oxlint receipt already required for that scope. A projection retains its stable logical control ID and failure semantics; it cannot turn another rule's failure into its own or silently rescan when a matching receipt exists.

## Freshness and proof reuse

Harness state binds harness/shared-control content. Checkpoint state binds the current product diff and downstream handoff. Changing the relevant content invalidates that state; the internal build phase consumes fresh proof and builds again instead of trusting a local build-state timestamp.

Full product unit proof is separately content-addressed and owned by `ci:proof`. The internal build phase may reuse it only when product/workspace inputs, product tests and support, dependency and Vitest configuration, unit-runner owner, semantic Node/container identity, and suite/pool match. CPU, RAM, and worker values are recorded as planning metadata and do not change the semantic result. A missing, malformed, partial, externally unverified, or mismatched receipt triggers the complete unit suite. Unit reuse never skips build, security, coverage, or another unrelated control.

Build/ZIP proof separately binds the full product, public asset, manifest, workspace, build configuration, dependency, Node/toolchain, production-environment, legal/generated-inventory, packaging-owner closure, and exact archive bytes. It belongs only to `ci:release`; Fast proof contains neither the receipt nor the ZIP. Release may consume that receipt only when its complete digest and exact archive match. Only the internal release-archive owner can mint the receipt; the quick `ci:build` command is intentionally outside this owner and its artifact is never accepted. The internal wrapper rejects `--reuse-build` because a prior local timestamp or state file cannot prove current archive bytes; reuse requires an externally verified receipt and matching archive.

CodeQL and coverage use the same fail-closed model in `ci:release`. Their complete input digests and required report hashes decide reuse; workflow YAML does not. A documentation-only change can reuse matching heavy proof only while its executable-control digest also matches. Reuse across different control digests is forbidden; changed production scope, queries, baseline, tests, configuration, dependencies, image, or control authority triggers recomputation.

## Commit-bound gates

`ci:proof` and `ci:release` are the only public full gates:

Only `qa:release-harness`, `qa:checkpoint`, and `qa:closeout` are diff-aware. Both `ci:*` gates resolve the complete repository product snapshot through the same scope owner locally and on GitHub; neither may select an owner-local or focused control set from the current diff.

Structural risk, changed-line readability, and UI automation seams are absent from both commit-wide CI contracts because their comparison authority is the live diff. They remain blocking in `qa:checkpoint` and `qa:closeout`. Other target-aware controls may report only their exact machine-declared `no-applicable-targets` disposition; trusted admission rejects a different skip reason.

- `ci:proof` runs repository-wide Fast controls, full Vitest, and the fast PR audit profile. It excludes SonarJS, coverage, CodeQL, mutation, Build, Release archive, and release-only audit controls. It proves the Fast Gate but does not claim release readiness.
- `ci:release` requires the exact Fast proof and does not rerun its unit suite. It adds release-only SonarJS, Build and Release archive, the full release audit with blocking jscpd/CodeQL/coverage/legal and supply-chain controls, and persistence/secrets mutation profiles. If an exact reusable Fast proof is unavailable, the same wrapper first executes the Fast prerequisite on the current machine and then runs the release-only delta. A fresh prerequisite supplies the one live product `npm audit` result to the release audit; reused Fast proof instead runs npm vulnerability and signature checks once in the release audit. No release path runs either owner twice.

Both run the same JS composition and QA owners directly on WSL. On a PR, GitHub/Selectel executes the candidate QA implementation exactly once. The read-only trusted-base launcher records both control digests and independently validates mandatory phase presence, candidate commit/tree, receipt schema, evidence closure and hashes, environment-owned execution-profile authority, capability claim, artifact closure, and final graph result. A digest mismatch is reported as `QA controls changed` and `candidate-controls`; it does not require a bootstrap PR. The launcher does not rerun the previous control implementation, so QA changes rely on normal human review and become canonical only after merge to `main`. Candidate execution receives no GitHub token, Selectel credentials, OIDC authority, or write access to the trusted mount.

The internal build phase and `qa:closeout` choose an adaptive default between four and eight Vitest workers according to visible CPU capacity. External `ci:release` receives its worker count from the selected `SELECTEL_RELEASE_PROFILES` entry. `SNIPTALE_QA_VITEST_MAX_WORKERS` remains the explicit local/operator override and is clamped to visible resources. Worker count belongs to the execution profile, not the semantic digest.

Executable QA implementation, executable policy, and behavior-changing tool configuration belong to the control digest. Explicitly registered ordinary owner maps and machine-generated inventories remain candidate semantic inputs checked by trusted validators and owner-specific digests, rather than executable authority. Unknown files in control roots default to control-affecting. Documentation-only derivation and all proof reuse require equal control digests. Release admission additionally requires the accepted control digest already present on `main`. The controls and receipt schema are semantically aligned, but host differences can change an outcome. Local execution accepts `--cpu N`, `--memory-mib N`, and `--workers N` and marks dirty proof `local-workspace`; it is diagnostic. Release admission and external proof reuse accept only `committed` locked-image proof.

`ci:proof -- --pr <number> --reason "<audit note>"` is the owner-only emergency bypass mode for unavailable external capacity or an incident. It starts from clean `origin/main`, materializes the exact remote PR commit, runs the same container owner, rechecks GitHub authority afterward, posts proof hashes and the mandatory operator reason, and never merges. It is not the routine route for QA-control changes.

The audit profile and product release modules still own their established semantics internally. They are no longer separate public `qa:release`, `qa:audit`, `ci:security`, or `ci:coverage` commands, so there is no second composition to synchronize.

## Locks and scheduling

Formatting is the first sequential checkpoint barrier. Independent focused lanes start only after it succeeds. In full verification, lightweight target/owner lanes may overlap Oxlint; Oxlint receives its declared CPU threads, native typecheck waits for it, and parser-heavy graph/light lanes wait for both. Full Vitest then runs as the saturated exclusive Fast phase. Vite build remains exclusive.

`qa:release-harness`, `qa:checkpoint`, `qa:closeout`, `ci:proof`, and `ci:release` participate in the blocking lifecycle. Do not run them concurrently. Closeout performs the authorized lock handoff to its internal build.

Local resource defaults and overrides are resolved by the existing resource-profile owner and clamped to visible CPU and memory. External Selectel values come only from the selected environment profile. They do not enter semantic proof identity or select a different control set; the receipt records the actual execution profile and its environment authority without imposing a second repository-owned minimum.

## Observability and failures

Canonical wrappers write a structured run record and bounded sanitized log under `.tmp`. Schema v3 records real `queued`, `started`, and terminal transitions incrementally and atomically for scope resolution, scheduler planning, worker bootstrap, lanes, build/archive, audit controls, mutation profiles, and artifact collection. Each activity records actual queue/execution timestamps, dependency and resource waits, dependencies, PID/worker identity, and execution resources without adding resources to semantic identity. The final summary reports wall time, interval-bounded critical path, active execution, queue/resource wait, slow controls, reuse, and skips. Large advisory inventories stay complete in the artifact log while the console receives only a bounded summary.

Full gates additionally collect the allowlisted records, logs, reports, ZIP, receipts, proof manifest, and `SHA256SUMS` into attempt-qualified `build/ci-artifacts` paths. Phase start/pass/fail markers remain visible in console output. A normal failure still seals the canonical bundle; timeout or interruption gets a separate best-effort incremental record/log artifact before runner cleanup.

Investigate a failed canonical stage with the focused direct command only when needed. Fix the owner defect, restore invalidated harness/checkpoint proof, and rerun the owning wrapper. Do not stack a manual closeout chain or repeat GitHub VM runs to debug a locally reproducible tooling failure.

`npm run qa:stats -- [--wrapper <id>] [--task <id>]` aggregates local run records by wrapper, mode, root run, task, step, control, problem, and skip reason.
