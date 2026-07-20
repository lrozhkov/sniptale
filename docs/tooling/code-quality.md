# Code Quality

Updated: 2026-07-16

This document owns the Sniptale quality model, guard families, baseline policy, and the boundary between deterministic enforcement and review judgment. Workflow belongs in [AGENTS.md](../../AGENTS.md), implementation decisions in [implementation-rules.md](../engineering/implementation-rules.md), wrapper lifecycle in [wrapper-summary.md](wrapper-summary.md), and command lookup in [operator-handbook.md](operator-handbook.md).

## Quality Model

Sniptale quality has four layers:

1. Deterministic controls enforce rules that can be detected with acceptable noise.
2. Risk-based independent review evaluates high-risk judgment that deterministic controls cannot fully encode.
3. Unified closeout proves and commits the accepted candidate.
4. Escaped-defect follow-up adds failing proof, explains the safety-net gap, and makes the same-change deterministic-improvement decision explicit.

The canonical order is `implementation → qa:checkpoint → required review → qa:closeout`. Required review receives the complete green candidate, runs independently without inherited context, and is repeated only when a correction changes the reviewed behavior, owner, public contract, or security seam. Low-risk changes do not require a separate review.

Quality, correctness, maintainability, security, and explicit ownership are default priorities; focused wrapper cost never justifies weaker architecture or proof.

## Deterministic Control Authorities

The machine authority is source and policy, not prose. This mapping identifies the current owner for each guard family.

| Guard family | Machine authority |
| --- | --- |
| Wrapper step/control identity and lane populations | `tooling/qa/core/qa-steps/**`, `tooling/qa/core/qa-controls/**`, `tooling/configs/qa/control-dispositions.data.json` |
| Validation coverage | `tooling/configs/qa/validation-manifest.json` |
| Product/harness/shared-control scope | `tooling/qa/core/qa-scope.mjs` |
| Runtime/import/owner topology | `tooling/qa/core/runtime-topology.data.json`, `tooling/qa/guards/architecture/**`, `tooling/qa/core/architecture-guardrails*.mjs` |
| Manifest permissions | `tooling/configs/qa/manifest-permissions.data.json`, `tooling/qa/guards/architecture/verify-manifest-permissions.mjs` |
| Browser, messaging, storage, and security ownership | `tooling/qa/policy/**`, `tooling/configs/qa/security-*-ownership.data.json`, `tooling/qa/guards/security/**` |
| Product identity retirement | `tooling/qa/core/verify-sniptale-identity.mjs`, `tooling/release/artifact-security-identity.mjs` |
| Readability, naming, suppression, logging, and shape | `tooling/qa/core/quality.config.mjs`, `tooling/qa/guards/quality/**`, focused verifier definitions |
| Coverage rollout, unit-test profiles, and thresholds | `tooling/qa/core/verify-test-coverage.registry.mjs`, `tooling/qa/core/verify-test-coverage.thresholds.mjs`, `tooling/qa/core/verify-build.test-profiles.mjs`, focused owner maps |
| Audit requiredness and structured skips | `tooling/configs/qa/audit-profiles.data.json`, `tooling/qa/audits/profiles/**` |
| Baselines, exceptions, and technical debt | `tooling/configs/qa/*baseline*`, `tooling/configs/qa/technical-debt.data.json`, owner-specific policy registries |

`qa:checkpoint` and broader lanes consume these authorities; documentation summarizes them and must not create a competing list of exact executable steps.

## Enforced Families

### Static Correctness And Readability

The enforced floor includes TypeScript/module hygiene, Oxlint, the type-aware ESLint subset, curated SonarJS correctness rules, formatting of supported non-Markdown files, changed-line readability, function/test/file pressure, naming, suppression bans, canonical logging, dead-export fallout, and cycle checks. Tests are not exempt.

Metrics are signals, not architecture boundaries. A file below a limit may still have the wrong owner, and a line-count extraction is incomplete when the same public contract or hidden seam remains.

### Architecture And Ownership

Deterministic controls cover runtime boundaries, dependency direction, manifest drift, thin entrypoints/facades, boundary input, browser/messaging/storage ownership, shared UI/style ownership, heavyweight dependencies, public-surface widening, returned-object growth, multi-message transition chains, detached controller methods, UI automation seams, and selected state/lifecycle hazards.

The Sniptale identity control rejects retired product roots and the retired Effect public version in current tracked/candidate paths, UTF-8 contents, embedded ZIP entry names and text payloads, and release artifacts. Dependency, cache, ignored task, and temporary directories are outside the current-tree scan; their produced artifacts are checked at the release boundary instead.

Architecture baselines and owner allowlists are migration containment, not permission for new debt. New or changed paths must resolve to their actual owner rather than the nearest facade.

### Security And Data Handling

Controls cover unsafe execution/rendering sinks, sanitizer ownership, plaintext secret storage, sensitive retention, secret-bearing network headers, diagnostic sanitization, privileged browser access, and manifest permission/resource policy. Security review remains broader than these matchers.

### Behavioral Proof And Release Confidence

Focused proof follows explicit owner mappings and the current diff. Closeout may reuse the same exact owner proof only for bounded low-risk profiles; the machine classifier keeps shared/public, background/offscreen, manifest, persistence, runtime-messaging, parser/export, deleted, ambiguous, and broad changes on affected-consumer discovery. Lifecycle and async risks still require acceptance-shaped failure, duplicate, replay, stale-result, rollback, and restore proof when applicable, but are not inferred as a generic filename profile. Full product coverage and external audit engines remain audit/release concerns rather than normal closeout gates.

## Judgment-Only Rules

The following remain required implementation/review judgment where current automation cannot detect them reliably without excessive noise:

- whether a topology is stable for the likely next `2-3` seam expansions
- whether a controller/state/props surface mixes independent authorities despite staying under size limits
- whether an extraction is a mechanical split that preserves the same broad contract
- whether shared residency is genuinely cross-runtime or merely a nested runtime-specific owner
- whether generic helpers conceal meaningful multi-transport, persistence, or authorization orchestration beyond current structural matchers
- whether failure, rollback, compensation, or user-visible degradation is complete for the product semantics
- whether algorithmic/scaling behavior is acceptable on parser, export, media, timeline, storage, or capture hot paths

These rules are not “advisory therefore optional.” Preflight and required high-risk review enforce them as judgment. When a repeated finding gains a low-noise detector, promote it to structured advisory or hard fail with explicit scope, fixtures, and false-positive policy.

## Review And Escaped Defects

A green pipeline is necessary but not sufficient when the current diff changes a high-risk seam. Security Code Review is required only for actual changes to privilege, trust, authorization, sensitive data policy, sanitization/import-export policy, secrets, retention, privacy, manifest permissions, or MV3 lifecycle authority. Architecture Code Review is required only for actual changes to runtime ownership, state/public contracts, dependency direction, parser semantics, UI/i18n/design-system ownership, or notable topology. Owner-local extraction, test/proof-only changes, literal clone removal, and mechanical moves that preserve those seams close as `not required: low-risk change`.

Collect all review findings before editing and classify each as a current-wave regression, direct acceptance blocker, provable security issue, or pre-existing hardening. The first three categories block closeout when supported by evidence; pre-existing hardening is a recommendation/debt item and unrelated pre-existing defects are not `Request changes`. Extra tests or stronger guarantees not required by the frozen acceptance criteria are comments, not blockers. Confirm blockers against the frozen acceptance criteria and make one consolidated correction. Mechanical cleanup does not trigger another review; changed behavior, ownership, public contracts, dependency direction, parser semantics, or security authority does.

An escaped defect requires failing proof first and classification of the missed safety-net condition, such as policy-only, narrow detector, changed-scope-only, accepted tradeoff, or success-biased proof. Generalizable repeat offenders should become deterministic controls; one-off product semantics may remain explicit owner proof and review judgment.

## Baselines And Exceptions

The canonical general baseline is `tooling/configs/qa/quality-baseline.json` and is expected to remain empty in normal state. Owner-specific baselines and technical-debt rows exist only for measured legacy debt or confirmed tool noise.

Every exception needs a rule/control identity, exact target scope, owner, reason, risk, removal action/condition, and review date where its schema supports one. Baseline growth is a policy change, not ordinary implementation fallout. Inline suppression directives are not a local exception mechanism.

Audit-tool baselines remain bounded by their own policy owners. A jscpd debt entry additionally freezes criteria, negative cases, and non-goals in its registry record. The scan remains audit-only: `qa:audit` deletes the previous report before execution, writes a fresh report, and validates exact baseline/registry scope and stale removal. Fast checkpoint and closeout wrappers do not run jscpd. Report-only or optional engines must emit explicit status and skip reasons; unavailable external tooling must not be confused with a green result.

Heavy lifecycle tools stay in their owning lanes: repository audit in `qa:audit`, build and release archive checks in `qa:build`/closeout. Their source changes are not focused blind spots: `qa:release-harness` selects exact adjacent owner tests for `verify-audit.mjs`, `verify-build.mjs`, `package-dist.mjs`, and `verify-architecture-guardrails.mjs`. Do not pull the full lifecycle operation into checkpoint to prove an implementation-only diff.

## Drift Control

Workflow-policy changes keep `AGENTS.md`, affected active tooling documents, `.agents/**`, package scripts, wrappers, and machine policy synchronized. Deterministic tools and wrappers record validation coverage in `tooling/configs/qa/validation-manifest.json`.

When a document starts mixing workflow, implementation policy, wrapper behavior, command catalogs, and quality policy, move each meaning back to its owner instead of growing another handbook.
