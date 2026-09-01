# Code quality

This document defines the Sniptale quality model and the acceptance rules for guards. Commands belong in the [operator handbook](operator-handbook.md), wrapper order in [wrapper summary](wrapper-summary.md), and exact executable membership in the machine-owned QA catalog and control inventory.

## Model

Quality enforcement is hybrid. Oxfmt owns formatting. Oxlint owns ordinary JS/TS lint, type-aware rules, React, Vitest, accessibility, Security rules, and syntax-only SonarJS rules. Ast-grep owns syntax patterns that do not need semantic state. Release-only ESLint owns the small residual SonarJS set that needs parser services. Repository-specific ownership, lifecycle, topology, cross-artifact, and proof-reuse invariants remain custom only when a ready engine cannot express them without losing semantics.

A logical result may aggregate several controls, but it is not automatically one analyzer owner. Categories organize execution; they do not define filesystem ownership. One owner has one authority and one independent reason to change.

The canonical machine entrypoints are:

- `tooling/qa/composition/catalog/catalog.mjs` for control identity, category, order, and wrapper membership;
- `tooling/qa/composition/control-inventory/discovery.mjs` for executable, consumer, and policy closure;
- `tooling/configs/qa/quality-baseline.json` for narrow accepted static-analysis debt;
- `tooling/qa/composition/scope/qa-scope.mjs` for product, harness, and inventory scope.

Documentation must not restate the full catalog, file population, lane size, or generated counts.

## Wrapper boundary

`qa:release-harness` owns executable tooling and shared-control changes. It auto-formats the current diff, validates composition and conditional dependency admission/typecheck, runs Oxlint and affected harness tests, then writes a freshness stamp.

`qa:checkpoint` auto-formats the diff, requires a fresh harness stamp where applicable, records non-blocking advisory signals, and runs focused product controls and affected tests. `qa:closeout` consumes a fresh checkpoint, performs a fresh build and artifact closure, stages the admitted diff, and commits.

The canonical local order is `implementation → qa:checkpoint → required review → qa:closeout`. When harness/shared-control files changed, `qa:release-harness` runs before checkpoint.

`ci:proof` is the complete repository proof. It includes read-only formatting, SonarJS, full product coverage, all product and harness unit tests, and one fresh release-mode `Production build` without archive or reusable build proof. `ci:release` requires that exact admitted proof, inherits its evidence, and owns only the separate release build/package proof and release-time assurance such as CodeQL and history-scoped controls. Mutation, repository evidence, and topology inventories remain advisory artifacts.

## Guard necessity

Every guard family is accepted against the current repository, not its historical name or registry row. Before changing or retaining it, answer:

1. Which reachable defect or product/process invariant does it protect?
2. Are its roots, paths, consumers, wrapper modes, and owners current?
3. Is the current repository population non-vacuous?
4. Is the invariant already owned by types, a ready analyzer, an owner test, or another stronger guard?
5. Would the rule encourage artificial files, facades, wrappers, naming, or abstractions merely to satisfy a metric?
6. Can a ready engine replace it without losing diff-aware checkpoint/closeout behavior?
7. Is the correct disposition `Remove`, `Replace`, `Consolidate`, or a proved `Keep`?

A useful intent with a failed implementation is not automatically retired. Reimplement it only when the invariant remains valuable and can be expressed with current, low-noise evidence. Otherwise remove it instead of preserving an identity for its own sake.

## Atomic acceptance

An atomic guard change is accepted only when all of the following hold:

- production consumers and wrapper occurrences are known;
- current roots and owner seams are used;
- every claimed smell has a negative fixture that blocks;
- a cohesive valid example passes without artificial splitting;
- live-repository execution proves the detector is not vacuous;
- changed-file and full-scan modes preserve their intended scope;
- previous and candidate findings are compared when an engine changes;
- old implementations, stale paths, forwarding layers, duplicate authority, and temporary comparison paths are gone after parity;
- production modules, single-consumer helpers, proxies, and navigation transitions have an explicit Consolidate or justified Keep result.

Test names and fixtures should describe the defect, not detector internals. A registry entry or declared `pass`/`fail` state is navigation metadata, not proof by itself.

## Structural and topology controls

Metrics are signals, not architecture boundaries. They must not force a cohesive owner to split or create a folder merely to reduce a score. Blocking structure rules require a concrete dependency, ownership, public-surface, side-effect, or state-authority invariant. Broad complexity and topology reports stay advisory/manual unless a low-noise semantic defect is demonstrated.

Diff-aware structural analysis compares behavioral files with `HEAD`; unchanged, import-only, mock-only, and rename-only files are not candidates. A topology change optimizes navigation and ownership clarity, not raw file count. Forwarding-only and single-consumer modules require consolidation unless a public contract, runtime boundary, cross-owner seam, or independent change reason justifies them.

The blocking forwarding-drift control is narrower than the manual topology inventory. It evaluates only production modules newly becoming pure forwarding in the candidate diff and only when the module has one direct production consumer. Exact package exports, registered runtime entrypoints, runtime boundaries, and canonically classified cross-owner edges are derived Keep evidence. Independent change reasons and temporary unresolved topology require an exact forwarder/direct-consumer policy entry with owner, evidence, removal condition, and an unexpired review date. Unchanged forwarding debt remains report-only.

## Security and release assurance

Security syntax and ownership rules use the smallest capable engine. Global data flow remains release-only. Supply-chain locks and artifact digests are valid when they bind an external binary, dependency graph, immutable image, release payload, or proof input.

Repository-derived consumer inventories are validated from the live tree and are not checked in as SHA or count snapshots. A digest stored beside the complete data it hashes is not an independent authority. Baselines contain only measured legacy findings or confirmed tool noise; they never self-update during a blocking run.

An accepted baseline entry remains non-blocking when its finding disappears or its source snapshot drifts. Stale entries and aggregate count/digest drift are maintenance advisories, not release work. New findings that do not match an exact enumerated baseline entry remain blocking, as do malformed or expired baseline policy and analyzer failures. Aggregate repository snapshots are advisory inventory rather than release admission authorities.

The pinned jscpd 5 release audit admits only exact findings reviewed as `tool-noise`. Every allowance records normalized endpoints, an owner, an evidence-backed reason, a removal condition, and a review date. New or shifted findings, malformed metadata, and expired reviews fail closed. Allowances absent from the live report are safe, non-blocking cleanup advisories because an absent exact ID cannot authorize another clone. Owner-family summaries are display-only and never authorize a clone. Checkpoint, closeout, and `ci:proof` do not run jscpd.

## Coverage

Changed-scope coverage enrolls every added or untracked eligible production TypeScript file, while unchanged legacy files outside the rollout registry remain unenrolled. Full product coverage belongs to `ci:proof` and is inherited by release only through exact admission. Tooling coverage is invoked separately with `node tooling/qa/proof/unit/verify-unit-tests.mjs --suite harness --coverage`; it instruments executable `tooling/**/*.{mjs,cjs,js,ts,tsx}`, writes `.tmp/coverage/tooling`, and applies one global floor of 70% statements, 67% branches, 78% functions, and 70% lines. Owner-local smell fixtures remain the primary semantic proof.

## Review and exceptions

Automated controls own deterministic properties. Architecture and security review own intent, authority placement, trust boundaries, and semantic tradeoffs that cannot be reduced safely to a low-noise rule.

Review findings are classified as current-wave regressions, direct acceptance blockers, provable security issues, or pre-existing hardening. Only the first three block closeout when supported by evidence. A new behavior, recovery path, compatibility layer, or proof obligation requires a concrete reachable trigger and connection to acceptance or a material invariant.

Every exception names its rule, exact scope, owner, reason, risk, and removal condition. Baseline growth is a policy change. Inline suppression directives are not a local exception mechanism.

An escaped defect gets a failing proof first, followed by a decision on whether the miss was narrow scope, weak semantics, stale topology, or an accepted tradeoff. A repeated low-noise pattern may justify a guard; a single incident or hypothetical bypass does not.
