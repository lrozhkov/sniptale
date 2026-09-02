# Wrapper Summary

This document owns wrapper scope, freshness, locks, handoffs, and observability. The canonical implementation order is `implementation → qa:checkpoint → required review → qa:closeout`.

## Diff-local QA

The live scope classifier is `tooling/qa/composition/scope/qa-scope.mjs`.

The canonical control catalog groups blocking and explicitly advisory controls into ordered categories from preparation and admission through syntax/semantics, graph/closure, behavioral and release proof, meta-policy, and orchestration. Report-only repository evidence and topology inventories are not quality controls. Public wrapper names and contracts stay stable. A wrapper selects a mode from the catalog; compatibility registries adapt execution but do not own a second list or order.

- `qa:preflight` is a read-only current-diff or explicit-file planning snapshot. It does not format, build, acquire the blocking lock, or write proof state.
- `qa:advisory` is optional non-blocking diagnosis over the current diff.
- `qa:structural-audit` is a manual report-only repository maintenance snapshot. It is never a PR or closeout gate.
- `qa:release-harness` uses the same diff-aware Oxfmt write barrier as checkpoint, then proves QA composition integrity, conditional dependency admission and Typecheck, Oxlint, and affected harness tests before writing the freshness stamp consumed by downstream local wrappers.
- `qa:checkpoint` formats supported non-Markdown targets, recollects the diff, verifies required harness freshness, records advisory failure as non-blocking evidence, then runs categorized diff-aware focused lanes for typecheck, tests, lint, graph/index, architecture/security controls, and eligible diff coverage. It does not build, stage, or commit.
- `qa:closeout` reuses or runs checkpoint, hands its lock to the internal build phase, validates unchanged proof scope, stages allowed changes, rejects `tasks/**`, and commits only after green build proof.

The internal build phase is not a public standalone wrapper. Closeout invokes the `qa:internal:build` script after fresh checkpoint/harness proof; its observed child-run identity remains `qa:build` for lock handoff and evidence. Checkpoint owns local semantic assurance, while the internal build phase owns only artifact construction and optional commit automation. Pre-push runs `qa:checkpoint` only. `ci:build` is an explicit quick `npm run build` bypass and makes no canonical QA claim.

Every external full gate performs `npm ci`; cached download bytes never replace dependency installation or exact lockfile validation there. A local full gate may reuse a previously verified install only while its stamp still matches the lockfile, every workspace manifest, `.npmrc`, Node/npm, platform/architecture, and the installed hidden lock. `--fresh-install` forces the cold path. The project-local npm policy admits ordinary releases only after seven days. The retired typed SonarJS lane no longer needs a legacy peer exception; the retained syntax rules run through Oxlint's JS-plugin adapter. An urgent security release may use `--min-release-age-exclude` only for the exact evidenced package on one install command; committed exclusions and a global age bypass are forbidden. Npm errors remain visible in the console.

Harness targets include executable `tooling/**`, workflows, hooks, QA-affecting root/package/TypeScript/Vite configuration, and active `docs/tooling/**` guidance. Exact data-only inventories are exempt only when `qa-scope` classifies them as such and their focused owner validator passes. Composition-only baseline, allowlist, allowance, debt, and equivalent exception-registry changes are data-only and do not schedule `qa:release-harness` or harness unit tests. Their executable matchers, parsers, validators, generators, and consumers remain harness targets.

Within an exact scope, Messaging and Browser-adapter syntax controls project from one ast-grep process and receipt. Logging projects from the one Oxlint receipt already required for that scope. A projection retains its stable logical control ID and failure semantics; it cannot turn another rule's failure into its own or silently rescan when a matching receipt exists.

## Freshness and proof reuse

Harness state binds harness/shared-control content. Checkpoint state binds the current product diff and downstream handoff. Changing the relevant content invalidates that state; the internal build phase consumes fresh proof and builds again instead of trusting a local build-state timestamp.

Full product unit proof is separately content-addressed and owned by `ci:proof`. The internal build phase may reuse it only when product/workspace inputs, product tests and support, dependency and Vitest configuration, unit-runner owner, semantic Node/container identity, and suite/pool match. CPU, RAM, and worker values are recorded as planning metadata and do not change the semantic result. A missing, malformed, partial, externally unverified, or mismatched receipt triggers the complete unit suite. Unit reuse never skips build, security, coverage, or another unrelated control.

Build/ZIP proof separately binds the full product, public asset, manifest, workspace, build configuration, dependency, Node/toolchain, production-environment, legal/generated-inventory, packaging-owner closure, and exact archive bytes. It belongs only to `ci:release`; Fast proof contains neither the receipt nor the ZIP. Release may consume that receipt only when its complete digest and exact archive match. Only the internal release-archive owner can mint the receipt; the quick `ci:build` command is intentionally outside this owner and its artifact is never accepted. The internal wrapper rejects `--reuse-build` because a prior local timestamp or state file cannot prove current archive bytes; reuse requires an externally verified receipt and matching archive.

Coverage belongs to `ci:proof`; its receipt and complete canonical report inventory are sealed with the Fast proof. `ci:release` accepts them only through an exact tree-, control-, and environment-bound admission receipt and records the corresponding controls as inherited. CodeQL remains a release-time control and keeps its own fail-closed input digest and SARIF binding. Workflow YAML cannot invent reuse, and reuse across different control digests is forbidden.

## Commit-bound gates

`ci:proof` and `ci:release` are the only public full gates:

Only `qa:release-harness`, `qa:checkpoint`, and `qa:closeout` are diff-aware. Both `ci:*` gates resolve the complete repository product snapshot through the same scope owner locally and on GitHub; neither may select an owner-local or focused control set from the current diff.

Changed-line readability remains a local diff control and is satisfied in Fast proof by the separate repository-wide readability control. Structural risk remains diff-only in Fast proof and blocks only candidate regressions relative to the accepted base; its absolute repository score is advisory maintenance information. UI automation seams use their repository-wide adapter. Mandatory file controls report their repository population; an unexplained zero-file population cannot pass.

- `ci:proof` runs the complete repository-wide deterministic control set, read-only formatting, Oxlint, full product coverage and tests, then a separate harness resource wave. Product-only candidates use the affected harness closure; CI/tooling/shared-control changes and explicit periodic proofs run all balanced harness partitions. The Fast audit profile and exactly one fresh `npm run build:release` result named `Production build` remain mandatory. That build creates no ZIP or reusable build receipt. The proof claims the Fast Gate but not release readiness.
- `ci:release` cannot start composition without an exact admitted Fast proof for the same candidate tree, controls, workspace mode, and execution environment. It records deterministic controls, product tests, coverage, and `Production build` as inherited, then executes only release-time history/supply-chain/CodeQL controls plus Build and Release archive. There is no fresh-prerequisite or missing-proof fallback.

The local launcher always verifies the installed project toolchain. It validates the complete workflow inventory only when the candidate changes workflows or their validation policy, provisions Canvas and ast-grep only when their verified native artifact stamp is absent or mismatched, and does not launch Chromium unless a real Playwright lane requests it. An exact local release reuses the proof's workflow result and the same verified install/native stamps. The external runner remains a cold-start path: full install, full workflow validation, and native provisioning execute on every run.

Repository audit evidence, repository-wide topology inventory, and persistence/secrets mutation results run in a separate non-blocking CI job after canonical proof sealing. The job has an isolated checkout and uploads only optional advisory artifacts; collector failure is recorded as failed advisory evidence and never changes gate admission or appears as a successfully passed quality control.

Both run the same JS composition and QA owners directly on WSL. On a PR, GitHub/Selectel executes the candidate QA implementation exactly once. The read-only trusted-base launcher records both control digests and independently validates mandatory phase presence, candidate commit/tree, receipt schema, evidence closure and hashes, environment-owned execution-profile authority, capability claim, artifact closure, and final graph result. A digest mismatch is reported as `QA controls changed` and `candidate-controls`; it does not require a bootstrap PR. The launcher does not rerun the previous control implementation, so QA changes rely on normal human review and become canonical only after merge to `main`. Candidate execution receives no GitHub token, Selectel credentials, OIDC authority, or write access to the trusted mount.

The internal build phase and `qa:closeout` choose an adaptive default between four and eight Vitest workers according to visible CPU capacity. External `ci:release` receives its worker count from the selected `SELECTEL_RELEASE_PROFILES` entry. `SNIPTALE_QA_VITEST_MAX_WORKERS` remains the explicit local/operator override and is clamped to visible resources. Worker count belongs to the execution profile, not the semantic digest.

Executable QA implementation, executable policy, and behavior-changing tool configuration belong to the control digest. Explicitly registered ordinary owner maps and machine-generated inventories remain candidate semantic inputs checked by trusted validators and owner-specific digests, rather than executable authority. Unknown files in control roots default to control-affecting. Documentation-only derivation and all proof reuse require equal control digests. Release admission additionally requires the accepted control digest already present on `main`. The controls and receipt schema are semantically aligned, but host differences can change an outcome. Local execution accepts `--cpu N`, `--memory-mib N`, and `--workers N` and marks dirty proof `local-workspace`; it is diagnostic. Release admission and external proof reuse accept only `committed` locked-image proof.

`ci:proof -- --pr <number> --reason "<audit note>"` is the owner-only emergency bypass mode for unavailable external capacity or an incident. It starts from clean `origin/main`, materializes the exact remote PR commit, runs the same container owner, rechecks GitHub authority afterward, posts proof hashes and the mandatory operator reason, and never merges. It is not the routine route for QA-control changes.

The audit profile and product release modules still own their established semantics internally. They are no longer separate public `qa:release`, `qa:audit`, `ci:security`, or `ci:coverage` commands, so there is no second composition to synchronize.

## Locks and scheduling

Formatting is the first sequential checkpoint barrier. Independent focused lanes start only after it succeeds. In Fast proof, repository controls, the Fast audit/coverage lane, the full harness test lane, and production build are scheduled as independent top-level work; the coverage lane is the sole product Vitest execution and also projects the logical Unit tests result. Release performs no product or harness Vitest process.

`qa:release-harness`, `qa:checkpoint`, `qa:closeout`, `ci:proof`, and `ci:release` participate in the blocking lifecycle. Do not run them concurrently. Closeout performs the authorized lock handoff to its internal build.

Local resource defaults and overrides are resolved by the existing resource-profile owner and clamped to visible CPU and memory. External Selectel values come only from the selected environment profile. They do not enter semantic proof identity or select a different control set; the receipt records the actual execution profile and its environment authority without imposing a second repository-owned minimum.

## Observability and failures

Canonical wrappers write a structured run record and bounded sanitized log under `.tmp`. Schema v4 records real `queued`, `started`, and terminal transitions incrementally and atomically for scope resolution, scheduler planning, worker bootstrap, lanes, build/archive, audit controls, and artifact collection. Mandatory proof controls record a non-vacuous repository-file population or an explicit repository-state population; inherited release controls carry exact source-proof evidence and remain distinct from fresh `passed` controls. Each activity records actual queue/execution timestamps, dependency and resource waits, dependencies, PID/worker identity, and execution resources without adding resources to semantic identity. The final summary reports wall time, interval-bounded critical path, active execution, queue/resource wait, slow controls, reuse, and skips. Large advisory inventories stay complete in the artifact log while the console receives only a bounded summary.

Full gates additionally collect the allowlisted records, logs, reports, ZIP, receipts, proof manifest, and `SHA256SUMS` into attempt-qualified `build/ci-artifacts` paths. Phase start/pass/fail markers remain visible in console output. A normal failure still seals the canonical bundle; timeout or interruption gets a separate best-effort incremental record/log artifact before runner cleanup.

Investigate a failed canonical stage with the focused direct command only when needed. Fix the owner defect, restore invalidated harness/checkpoint proof, and rerun the owning wrapper. Do not stack a manual closeout chain or repeat GitHub VM runs to debug a locally reproducible tooling failure.

`npm run qa:stats -- [--wrapper <id>] [--task <id>]` aggregates local run records by wrapper, mode, root run, task, step, control, problem, and skip reason.
