# Code quality

This document owns quality-control and exception policy. Commands belong in [operator-handbook.md](operator-handbook.md). Wrapper behavior belongs in [wrapper-summary.md](wrapper-summary.md).

## Authorities

Oxfmt owns formatting. Oxlint owns JS/TS lint, typed rules, React, Vitest, accessibility, security syntax, and retained SonarJS syntax rules. Ast-grep owns syntax patterns that do not require semantic state. Custom guards are allowed only for repository invariants that these engines, types, or owner tests cannot express without losing semantics.

Machine authorities are:

- [`catalog.mjs`](../../tooling/qa/composition/catalog/catalog.mjs) for control identity, order, category, and wrapper membership
- [`discovery.mjs`](../../tooling/qa/composition/control-inventory/discovery.mjs) for executable and consumer closure
- [`quality-baseline.json`](../../tooling/configs/qa/quality-baseline.json) for exact static-analysis false positives
- [`qa-scope.mjs`](../../tooling/qa/composition/scope/qa-scope.mjs) for product, harness, and inventory scope

Do not copy their inventories, counts, or classifications into documentation.

Local workflow order belongs in [wrapper-summary.md](wrapper-summary.md). `AGENTS.md` owns workflow actions.

## Guard acceptance

Keep a guard only when all of these conditions hold:

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

Treat heuristic findings as triage. Fix confirmed defects.

Record only confirmed false positives as exact `tool-noise`. Each entry names the rule, exact scope, owner, reason, removal condition, and review date when the schema requires one. Do not baseline debt, auto-update a baseline, weaken a rule, or add a directory or message-pattern waiver.

A stale exception is cleanup advice unless its schema declares expiry blocking. A malformed exception or unmatched new finding fails under the owning control.

Structural allowances additionally bind the current symbol and body hashes defined by machine policy. Clone allowances bind normalized endpoints. Machine-generated summaries never authorize an exception.

## Coverage and assurance

Changed-scope product coverage follows the machine rollout registry. `ci:proof` owns full product coverage. Tooling coverage is a separate maintenance proof; its current scope and thresholds come from the executable owner.

Global data-flow and history-scoped audits remain release-only. Supply-chain locks and digests are justified only when they bind an external dependency, immutable image, proof input, or release artifact.

Automated controls own deterministic properties. Review owns intent, authority placement, trust boundaries, and semantic tradeoffs that cannot be reduced to a low-noise check.
