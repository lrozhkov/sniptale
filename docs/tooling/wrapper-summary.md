# Wrapper Summary

Updated: 2026-07-14

This document owns wrapper lifecycle, scope/freshness state, locks, handoffs, and observability. Workflow belongs in [AGENTS.md](../../AGENTS.md), quality policy in [code-quality.md](code-quality.md), and command lookup in [operator-handbook.md](operator-handbook.md).

The canonical order is `implementation → qa:checkpoint → required review → qa:closeout`. Wrapper speed and scope describe tool cost, not permission for weaker architecture or proof.

## Scope Authority

The live scope classifier is `tooling/qa/core/qa-scope.mjs`.

- Product targets are implementation/application/package files plus shared controls.
- Harness targets include `tooling/**` plus shared controls.
- Shared controls participate in both scopes: `.agents/**`, `AGENTS.md`, hooks, QA-affecting root/package/lock/TypeScript/Vite configuration, and active `docs/tooling/**` guidance.

Whenever the current diff has harness targets, run `npm run qa:release-harness` before a consumer wrapper that requires its freshness stamp. Documentation lists the categories; the classifier remains authoritative.

## Diff And Freshness Model

`qa:preflight`, `qa:advisory`, `qa:checkpoint`, `qa:closeout`, `qa:build`, and `qa:release-harness` resolve the current workspace state according to their contracts. Focused/checkpoint/build/closeout commands do not accept an explicit file scope; preflight alone accepts `--files <paths...>` for pre-edit planning.

Freshness states bind proof to the relevant content fingerprint rather than a mutable claim:

- harness state proves the current harness/shared-control scope
- checkpoint state proves the current product scope and full-diff relationship used by downstream handoff
- build state proves the current build closure

Changing the relevant diff invalidates reuse. `qa:closeout` may reuse fresh matching checkpoint/build state; otherwise it executes the required child wrapper.

## Wrapper Lifecycles

### `qa:preflight`

Read-only context collection. It reports relevant documents, target files, seam clusters, likely build scope, budget risks, advisory hints, and proof areas. It does not format, write proof state, acquire the blocking lock, build, stage, or commit. Use `--verbose` for inline detail and `-- --files <paths...>` before a diff exists.

### `qa:advisory`

Optional non-blocking diagnosis over the current diff. It emits structured heuristic findings and does not replace blocking proof. Normal implementation receives advisory state through `qa:checkpoint`; do not add advisory as a routine extra gate.

### `qa:release-harness`

Blocking harness/shared-control proof. It runs the harness-owned formatting/static/type/test contract and writes the harness freshness state consumed by checkpoint, build, release, and closeout paths. It does not run product coverage or commit.

### `qa:checkpoint`

Blocking in-progress product proof over the current diff. It verifies required harness freshness, formats supported non-Markdown product targets, records advisory state, runs focused static/architecture/security controls, typecheck when required, directly changed and owner-selected tests, and eligible diff coverage. Successful unit-test steps identify their `checkpoint-owner` or `checkpoint-direct` profile in the diagnostic log. It writes checkpoint state and does not build, stage, or commit.

### `qa:build`

Blocking broader product/build proof. It requires fresh matching checkpoint state and applicable harness state, runs broader checks/tests not owned by focused proof, produces the artifact build, and writes build state. Unit-test scope is selected automatically by `tooling/qa/core/verify-build.test-profiles.mjs`: small low-risk changes with complete owner-test proof use `owner-direct`; runtime, persistence, messaging, parser/export, package/public, deleted, ambiguous, or over-budget changes use `related-transitive`; test-only changes use `direct-changed`; changes without product test targets use `skip`. A deleted production target uses surviving related or deterministic owner proof and falls back to the full product suite only when neither exists. Full-suite product tests otherwise remain release/audit proof. Direct commit flags are operator/debug surfaces; normal commits use `qa:closeout`.

### `qa:closeout`

Blocking commit owner. It reuses or runs checkpoint, hands the lock to `qa:build`, validates that the current diff still matches fresh proof, stages with `git add -A`, rejects staged `tasks/**`, and commits only after green build proof. Test-profile selection is deterministic from the current diff and has no manual narrow-mode override. Agents do not manually stage the candidate before closeout.

### `qa:release`

Blocking release-grade product proof. It requires applicable harness freshness, runs the full release verification contract, and builds in release mode. It is for release preparation, audit-grade proof, or explicit direction, not ordinary implementation closeout.

### `qa:audit`

Blocking manual audit lane selected by an audit profile. It owns full product coverage, repository evidence/topology inventory, supply-chain checks, and configured external engines with structured required/optional/excluded status. The report-only inventory controls atomically replace sanitized complete artifacts at `.tmp/repo-audit/evidence.json` and `.tmp/repo-audit/topology.json`; Semgrep and npm supply-chain controls persist sanitized result evidence at `.tmp/semgrep/results.json`, `.tmp/npm-audit/results.json`, and `.tmp/npm-audit/signatures.json`. Green status means the control ran successfully, not that a report-only artifact contains zero findings. It is not a normal implementation gate and should not be run between ordinary implementation waves.

### `qa:e2e`

Separate Playwright extension smoke. It is runtime acceptance proof, not a third product/harness wrapper mode and not automatically part of closeout.

## Blocking Lock And Handoffs

`qa:release-harness`, `qa:checkpoint`, `qa:closeout`, `qa:build`, `qa:release`, and `qa:audit` use one blocking-wrapper lock. Do not start them in parallel. `qa:closeout` performs an authorized lock handoff to its child build; users should not start another wrapper while that chain is active.

A live process consuming CPU is not a hang merely because output is quiet. `qa:audit` records every control start/completion in its diagnostic log as execution proceeds and also prints phase transitions for its longest CodeQL and full-coverage controls. Use the run record and diagnostic log before interrupting a long full-suite, coverage, audit, or build step.

## Observability

Canonical wrappers write one structured run record and one bounded sanitized diagnostic log per invocation under `.tmp`. Default terminal output stays concise: overall result, duration, problem/control identifiers, the JSON run-record path, and the sanitized diagnostic-log path. The diagnostic log is live evidence: wrappers may append bounded progress before final steps are known, and each append refreshes the run record's log metadata. When a wrapper failure contains structured child-run evidence, the summary also prints every unique child diagnostic-log path so the actionable nested output is directly reachable. `--verbose` is wrapper-specific; use the diagnostic logs for detail.

`npm run qa:stats -- [--wrapper <id>] [--task <id>]` aggregates records by wrapper, mode, root run, task, step, control, problem, and skip reason. Legacy JSONL timing files are read-only fallback and receive no new writes.

## Failure Handling

Investigate the failed wrapper stage with the direct command listed in [operator-handbook.md](operator-handbook.md) only when needed. Fix local defects, return to preflight for owner/topology/proof-scope mistakes, restore invalidated harness/checkpoint proof, and rerun the canonical wrapper rather than stacking a manual closeout chain.
