# Wrapper Summary

Updated: 2026-07-22

This document owns wrapper lifecycle, scope/freshness state, locks, handoffs, and observability. Workflow belongs in [AGENTS.md](../../AGENTS.md), quality policy in [code-quality.md](code-quality.md), and command lookup in [operator-handbook.md](operator-handbook.md).

The canonical order is `implementation → qa:checkpoint → required review → qa:closeout`. Wrapper speed and scope describe tool cost, not permission for weaker architecture or proof.

## Scope Authority

The live scope classifier is `tooling/qa/core/qa-scope.mjs`.

- Product targets are implementation/application/package files plus shared controls.
- Harness targets include `tooling/**` plus shared controls.
- Shared controls participate in both scopes: `.github/workflows/**`, `.agents/**`, `AGENTS.md`, hooks, QA-affecting root/package/lock/TypeScript/Vite configuration, and active `docs/tooling/**` guidance.

Whenever the current diff has executable harness targets, run `npm run qa:release-harness` before a consumer wrapper that requires its freshness stamp. Exact machine-generated technical-debt and OSS-consumer inventories are data-only targets: checkpoint runs their owner validators without requiring a fresh harness stamp. Generated inventories are never treated as execution evidence for another policy file. Policy JSON, baselines, allowlists, and executable registries are not data-only. Documentation lists the categories; the classifier remains authoritative.

## Diff And Freshness Model

`qa:preflight`, `qa:advisory`, `qa:checkpoint`, `qa:closeout`, `qa:build`, and `qa:release-harness` resolve the current workspace state according to their contracts. Focused/checkpoint/build/closeout commands do not accept an explicit file scope; preflight alone accepts `--files <paths...>` for a read-only pre-edit structural snapshot. `qa:structural-audit` is a distinct manual repository-maintenance report, not an enforcement scope.

Freshness states bind proof to the relevant content fingerprint rather than a mutable claim:

- harness state proves the current harness/shared-control scope
- checkpoint state proves the current product scope and full-diff relationship used by downstream handoff
- build state proves the current build closure

Changing the relevant diff invalidates reuse. `qa:closeout` may reuse fresh matching checkpoint/build state; otherwise it executes the required child wrapper.

## Wrapper Lifecycles

### `qa:preflight`

Read-only context collection. It reports scope, canonical owner/runtime, relevant documents, structural pressure, contracts/consumer-discovery needs, proof, build forecast, and advisory. Current-diff mode uses behavioral files; `-- --files <paths...>` produces a non-blocking explicit planning snapshot without writing advisory/checkpoint state. Forecast and topology context stay bounded to the diff, exact mapped/adjacent owner tests, same-directory owner siblings, and direct HEAD import candidates; they do not build a repository-wide production index or claim complete consumer discovery without a bounded chain. Large path lists render a bounded head and tail with the total count and a full-list digest so later sections remain visible and the omitted middle remains comparable. It does not format, acquire the blocking lock, build, stage, or commit.

### `qa:advisory`

Optional non-blocking diagnosis over the current diff. Its machine catalog contains only structural file/function pressure, UI proof gaps, and detached this-sensitive methods. UI visual-proof findings require a view-bearing JSX/CSS/presentation change; test files and state/controller-only wiring do not create screenshot guidance. Findings are always printed and saved as sanitized diagnostic locations plus bounded advisory state v2. Normal implementation receives the same advisory block through `qa:checkpoint`; do not add advisory as a routine extra gate.

### `qa:structural-audit`

Manual report-only architecture-maintenance snapshot over repository code. It combines structural concentration with deterministic owner/change-reason topology clusters and reports `Split`, `Consolidate`, or `Keep` evidence, including navigation transitions and fragmentation signals. The goal is fewer transitions without removing explicit runtime, owner, adapter, or contract boundaries. It writes a bounded sanitized schema-v2 artifact at `.tmp/structural-audit/report.json`, never converts findings into a blocking result, and is not part of PR gates, normal agent workflow, closeout, or `qa:audit`. It does not collect model-token or token-hotspot inventories.

### `qa:release-harness`

Blocking harness/shared-control proof. It runs the harness-owned formatting/static/type/test contract and writes the harness freshness state consumed by checkpoint, build, release, and closeout paths. An inventory-only scope skips this wrapper and uses the checkpoint owner validators instead; a standalone build still requires that fresh checkpoint. It does not run product coverage or commit.

### `qa:checkpoint`

Blocking in-progress product proof over the current diff. It verifies required harness freshness, formats supported non-Markdown product targets, prints and records advisory state, runs diff-scoped structural risk plus focused static/architecture/security controls, typecheck when required, directly changed and owner-selected tests, and eligible diff coverage. Successful unit-test steps identify their `checkpoint-owner` or `checkpoint-direct` profile in the diagnostic log. It writes checkpoint state and does not build, stage, or commit.

### `qa:build`

Blocking broader product/build proof. It requires fresh matching checkpoint state and applicable harness state, runs broader checks/tests not owned by focused proof, produces the artifact build, and writes build state. Unit-test scope is selected automatically by `tooling/qa/core/verify-build.test-profiles.mjs`: small low-risk changes with complete owner-test proof use `owner-direct`; runtime, persistence, messaging, parser/export, package/public, deleted, ambiguous, or over-budget changes use `related-transitive`; test-only changes use `direct-changed`; changes without product test targets use `skip`. Deleted tests stay fingerprinted but are not executable. A deleted production chain uses bounded surviving proof only when its complete HEAD consumer closure and current redirect closure resolve inside one changed owner group with existing deterministic owner tests; partial, cross-owner, missing, or ambiguous closure falls back to the full product suite. Full-suite product tests otherwise remain release/audit proof. Direct commit flags are operator/debug surfaces; normal commits use `qa:closeout`.

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

Canonical wrappers write one structured run record and one bounded sanitized diagnostic log per invocation under `.tmp`. Advisory, preflight, checkpoint/closeout advisory reuse, and standalone structural steps expose a `consoleOutput` block before the summary; the common sanitizer removes secrets and workspace paths, caps the block at `16 KiB`, and marks truncation. A wrapper renders each finding family once: checkpoint and closeout advisory output owns structural watches, while the structural step retains its blocking result and standalone/harness output without repeating the watch block. The zero case is explicit as `attention=0, watch=0`, and `--verbose` does not duplicate the block. Successful advisory findings are also stored as sanitized diagnostic locations. Other default output stays concise: overall result, duration, problem/control identifiers, the JSON run-record path, and the sanitized diagnostic-log path.

`npm run qa:stats -- [--wrapper <id>] [--task <id>]` aggregates records by wrapper, mode, root run, task, step, control, problem, and skip reason. Legacy JSONL timing files are read-only fallback and receive no new writes.

## Failure Handling

Investigate the failed wrapper stage with the direct command listed in [operator-handbook.md](operator-handbook.md) only when needed. Fix local defects, return to preflight for owner/topology/proof-scope mistakes, restore invalidated harness/checkpoint proof, and rerun the canonical wrapper rather than stacking a manual closeout chain.
