# Wrapper Summary

This document owns wrapper scope, freshness, locks, handoffs, and observability. The canonical implementation order is `implementation → qa:checkpoint → required review → qa:closeout`.

## Diff-local QA

The live scope classifier is `tooling/qa/core/qa-scope.mjs`.

- `qa:preflight` is a read-only current-diff or explicit-file planning snapshot. It does not format, build, acquire the blocking lock, or write proof state.
- `qa:advisory` is optional non-blocking diagnosis over the current diff.
- `qa:structural-audit` is a manual report-only repository maintenance snapshot. It is never a PR or closeout gate.
- `qa:release-harness` proves executable harness and shared-control changes and writes the freshness stamp consumed by downstream local wrappers.
- `qa:checkpoint` formats supported non-Markdown targets, recollects the diff, then runs focused typecheck, tests, lint, graph/index, architecture/security controls, and eligible diff coverage. It does not build, stage, or commit.
- `qa:closeout` reuses or runs checkpoint, hands its lock to the internal build phase, validates unchanged proof scope, stages allowed changes, rejects `tasks/**`, and commits only after green build proof.

The internal build phase is not a public standalone wrapper. Closeout and pre-push invoke it after fresh checkpoint/harness proof. It selects direct, related, saturated, or full unit scope from the existing deterministic owner, produces the artifact build, and writes build state. `ci:build` is different: it is an explicit quick `npm run build` bypass and makes no canonical QA claim.

Harness targets include executable `tooling/**`, workflows, hooks, QA-affecting root/package/TypeScript/Vite configuration, and active `docs/tooling/**` guidance. Exact data-only inventories are exempt only when `qa-scope` classifies them as such and their focused owner validator passes. A policy JSON, baseline, allowlist, or executable registry is not data-only.

## Freshness and proof reuse

Harness state binds harness/shared-control content. Checkpoint state binds the current product diff and downstream handoff. Build state binds the build closure. Changing the relevant content invalidates that state.

Full product unit proof is separately content-addressed. The internal build phase and `ci:release` may reuse it only when product/workspace inputs, product tests and support, dependency and Vitest configuration, unit-runner owner, semantic Node/container identity, and suite/pool match. CPU, RAM, and worker values are recorded as planning metadata and do not change the semantic result. A missing, malformed, partial, externally unverified, or mismatched receipt triggers the complete unit suite. Unit reuse never skips build, security, coverage, or another unrelated control.

Build/ZIP proof separately binds the full product, public asset, manifest, workspace, build configuration, dependency, Node/toolchain, production-environment, legal/generated-inventory, packaging-owner closure, and exact archive bytes. `ci:proof` and `ci:release` can consume that receipt when its complete digest matches. Only the internal release-archive owner can mint the receipt; the quick `ci:build` command is intentionally outside this owner and its artifact is never accepted.

CodeQL and coverage use the same fail-closed model in `ci:release`. Their complete input digests and required report hashes decide reuse; workflow YAML does not. A documentation-only change can reuse matching heavy proof, while changed production scope, queries, baseline, tests, configuration, dependencies, or image triggers recomputation.

## Commit-bound gates

`ci:proof` and `ci:release` are the only public full gates:

Only `qa:release-harness`, `qa:checkpoint`, and `qa:closeout` are diff-aware. Both `ci:*` gates resolve the complete repository product snapshot through the same scope owner locally and on GitHub; neither may select an owner-local or focused control set from the current diff.

- `ci:proof` runs non-Vitest product verification, build/ZIP proof, and the fast PR security/dependency audit. Its machine policy explicitly marks `fullVitest: false` and `releaseReady: false`.
- `ci:release` owns full Vitest together with complete product verification, the release audit, CodeQL, canonical coverage, SBOM/license controls, and persistence/secrets mutation profiles.

Both run the same JS composition and QA owners directly on WSL. GitHub/Selectel executes candidate controls only when their complete digest is identical to trusted base; intentional control changes use the documented CI-authority bootstrap. Candidate and trusted-base control digests are recorded independently. The read-only trusted-base launcher owns the mandatory phase order and independently validates the candidate commit/tree, receipt schema, evidence closure and hashes, allowed reuse dispositions, capability claim, execution minimums, and final required result. The controls and receipt schema are semantically aligned, but host differences can change an outcome. Local execution accepts `--cpu N`, `--memory-mib N`, and `--workers N` and marks dirty proof `local-workspace`; it is diagnostic. Release admission and external proof reuse accept only `committed` locked-image proof.

`ci:proof -- --pr <number>` is the owner-only bypass mode. It starts from clean `origin/main`, materializes the exact remote PR commit, runs the same container owner, rechecks GitHub authority afterward, posts proof hashes, and never merges.

The audit profile and product release modules still own their established semantics internally. They are no longer separate public `qa:release`, `qa:audit`, `ci:security`, or `ci:coverage` commands, so there is no second composition to synchronize.

## Locks and scheduling

Formatting is the first sequential checkpoint barrier. Independent focused lanes start only after it succeeds. Build and full product verification may use bounded concurrent lanes, then a saturated exclusive unit phase. Vite build remains exclusive.

`qa:release-harness`, `qa:checkpoint`, `qa:closeout`, `ci:proof`, and `ci:release` participate in the blocking lifecycle. Do not run them concurrently. Closeout performs the authorized lock handoff to its internal build.

Resource defaults and overrides are resolved by the existing resource-profile owner. Values are clamped to visible CPU and memory. They do not enter semantic proof identity or select a different control set. A separate execution-profile receipt and trusted minimum decide reuse compatibility, so a weak diagnostic run cannot seed canonical release provenance.

## Observability and failures

Canonical wrappers write a structured run record and bounded sanitized log under `.tmp`. Schema v3 records real `queued`, `started`, and terminal transitions incrementally and atomically for scope resolution, scheduler planning, worker bootstrap, lanes, build/archive, audit controls, mutation profiles, and artifact collection. Each activity records actual queue/execution timestamps, dependency and resource waits, dependencies, PID/worker identity, and execution resources without adding resources to semantic identity. The final summary reports wall time, interval-bounded critical path, active execution, queue/resource wait, slow controls, reuse, and skips. Large advisory inventories stay complete in the artifact log while the console receives only a bounded summary.

Full gates additionally collect the allowlisted records, logs, reports, ZIP, receipts, proof manifest, and `SHA256SUMS` into attempt-qualified `build/ci-artifacts` paths. Phase start/pass/fail markers remain visible in console output. A normal failure still seals the canonical bundle; timeout or interruption gets a separate best-effort incremental record/log artifact before runner cleanup.

Investigate a failed canonical stage with the focused direct command only when needed. Fix the owner defect, restore invalidated harness/checkpoint proof, and rerun the owning wrapper. Do not stack a manual closeout chain or repeat GitHub VM runs to debug a locally reproducible tooling failure.

`npm run qa:stats -- [--wrapper <id>] [--task <id>]` aggregates local run records by wrapper, mode, root run, task, step, control, problem, and skip reason.
