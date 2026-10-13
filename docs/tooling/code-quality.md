# Code quality

This document owns quality-control and exception policy. Commands belong in [operator-handbook.md](operator-handbook.md). Wrapper behavior belongs in [wrapper-summary.md](wrapper-summary.md).

## Authorities

Oxfmt owns formatting. Oxlint owns JS/TS lint, typed rules, React, Vitest, accessibility, security syntax, and retained SonarJS syntax rules. Ast-grep owns syntax patterns that do not require semantic state. Custom guards may serve only repository invariants that these engines, types, or owner tests cannot express without loss of semantics.

Machine authorities are:

- [`catalog.mjs`](../../tooling/qa/composition/catalog/catalog.mjs) for control identity, order, category, and wrapper membership
- [`discovery.mjs`](../../tooling/qa/composition/control-inventory/discovery.mjs) for executable and consumer closure
- [`quality-baseline.json`](../../tooling/configs/qa/quality-baseline.json) for exact static-analysis false positives
- [`qa-scope.mjs`](../../tooling/qa/composition/scope/qa-scope.mjs) for product, harness, and inventory scope

Do not copy their inventories, counts, or classifications into documentation.

Local workflow order belongs in [wrapper-summary.md](wrapper-summary.md). `AGENTS.md` owns workflow actions.

## Guard acceptance

Keep a guard only if all of these conditions hold:

- it protects a reachable defect or named invariant
- its roots, consumers, modes, and owner match the current repository
- its live scan evaluates an eligible target or explicit repository-state input
- no type, analyzer, owner test, or stronger guard already owns the invariant
- valid code can pass without artificial files, facades, names, or abstractions
- blocking findings have deterministic negative fixtures
- changed-file and full-scan modes preserve their declared scope

Remove a redundant or vacuous guard. Replace a custom guard when a maintained engine preserves its semantics. Consolidate guards that enforce the same invariant through the same evidence.

Metrics are signals, not architecture boundaries. Block only a concrete ownership, dependency, public-surface, side-effect, state-authority, or current-diff invariant. Repository-wide complexity and topology inventories remain advisory until a low-noise blocking invariant exists.

Generated documentation facts are exact machine output. Authored-prose contradiction and phrase checks are advisory unless they test an explicit contract.

## Exceptions

Investigate heuristic findings. Fix established defects.

Record only established false positives as exact `tool-noise`. Each entry names the rule, exact scope, owner, reason, and removal condition. If the schema requires a review date, include that date. Do not baseline debt.

Do not auto-update a baseline. Do not weaken a rule. Do not add a directory or message-pattern waiver.

A stale exception is cleanup advice unless its schema declares expiry blocking. A malformed exception or unmatched new finding fails under the owning control.

Structural allowances also bind the current symbol and body hashes from machine policy. Clone allowances bind normalized endpoints. Machine-generated summaries never authorize an exception.

## Coverage and assurance

Changed-scope product coverage follows the machine rollout registry. `ci:proof` owns full product coverage. Tooling coverage is a separate maintenance proof. Its current scope and thresholds come from the executable owner.

Global data-flow and history-scoped audits remain release-only. Only a bound external dependency, immutable image, proof input, or release artifact justifies supply-chain locks and digests.

Automated controls own deterministic properties. Review owns intent, authority placement, trust boundaries, and semantic tradeoffs that cannot be reduced to a low-noise check.
