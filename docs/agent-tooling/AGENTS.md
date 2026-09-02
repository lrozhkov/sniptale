# AGENTS.md

Workflow contract for Sniptale. Technical decisions follow `docs/engineering/implementation-rules.md`.

## Task Scope

- Before implementation, record the acceptance criteria, non-goals, planned files, and consumers.
- Do not infer urgency.
- Expand scope only for an acceptance criterion, observed defect, existing invariant, reachable supported flow, or material risk.
- Material risks are security, privacy, authorization, trust-boundary, and irreversible-data-loss risks.

Classify each review finding by the first matching definition:

1. `security issue`: an evidenced material risk within the task scope
2. `current regression`: a non-security defect introduced or worsened by the candidate
3. `acceptance blocker`: another condition that prevents an acceptance criterion
4. `pre-existing hardening`: a condition that does not block acceptance and was not worsened by the candidate

The first three classes block completion. Report pre-existing hardening only when it affects a task decision or the user requests it.

## Preflight

Run preflight before a task that changes production behavior, public contracts, persistence, runtime boundaries, permissions, topology, QA tooling, or more than one owner.

Read:

- `AGENTS.md`
- `docs/engineering/implementation-rules.md`
- `docs/architecture/repository-overview.md`

Also read the matching policy:

- runtimes or cross-runtime ownership: `docs/architecture/runtime-contexts.md`
- topology, naming, or split strategy: `docs/architecture/code-organization.md`
- platform-pattern divergence: `docs/architecture/platform-patterns-and-tradeoffs.md`
- translated UI or locale behavior: `docs/architecture/i18n-architecture.md`
- parsing, snapshots, traversal, export, or apply-back: `docs/architecture/parser-architecture.md`
- product UX or extension UI: `DESIGN.md`
- credentials, sensitive storage, diagnostics, tracing, or secret headers: `docs/security/data-handling.md`
- extension permissions or manifest capabilities: `docs/security/manifest-permissions.md`

For planned paths, run `npm run qa:preflight -- --files <paths...>`. For the current task diff, run `npm run qa:preflight`.

Use the reported owners, risks, documents, consumers, and proof requirements to finalize the plan.

A broad move adds, moves, or renames files across an owner boundary or changes a public import path.

Before a broad move, list every affected file and consumer, owner boundary, public contract, typecheck scope, collision, rollback, file mode, content digest, risk, and proof. The inventory must be complete.

Return to preflight when implementation exceeds the recorded scope.

## Implementation

- For an escaped defect, add failing proof first. Record why existing QA missed it and whether a deterministic guard is required.
- Format only with `npm run format:write`.
- Do not run a formatter on authored Markdown.
- Modify generated legal text only through its generator or digest owner.
- Subagents may investigate, diagnose, or implement disjoint work. The main thread runs all blocking QA wrappers.

## QA, Review, and Closeout

Follow this order. Repeat a step only when a later edit invalidates its result.

1. Complete the candidate and deterministic proof for required success and failure paths.
2. If preflight reports harness or shared-control files, run `npm run qa:release-harness`.
3. Run `npm run qa:checkpoint`.
4. Apply its change-risk report:
   - Run every indicated `$security-code-review` and `$architecture-code-review`.
   - Treat the routing as required even though wrappers neither store nor enforce it.
   - Absence of a routed review or classified seam is not a low-risk determination or a review waiver.
   - When a review is not routed, inspect the actual implementation against both review-skill triggers before closeout. Run every applicable review or record an implementation-specific reason why that review is `not required`.
5. Resolve review findings under the rules below, apply one correction batch, and repeat invalidated proof or review.
6. Run `npm run qa:closeout -- -m "<commit message>"`.

For a planned broad move, run `$topology-plan-review` before implementation. For an already implemented broad move without prior topology review, run it after all required proof passes.

Each review required by checkpoint routing or executor assessment uses a new read-only subagent with `fork_turns: "none"`. Provide the scope manifest, exact diff, preflight result, and QA results. Do not provide intended conclusions.

Collect all review findings before editing. Confirm each finding against acceptance criteria, evidence, and invariants.

A finding may require new behavior or proof only for a reachable trigger tied to acceptance or a material invariant.

Repeat review only when a correction changes behavior, ownership, public contracts, dependency direction, parser semantics, or security.

Treat heuristic findings as triage. Fix confirmed defects.

Record a confirmed false positive as exact `tool-noise` with its owner, reason, and removal condition. Do not baseline debt, weaken a rule, or add a broad exception.

`qa:closeout` owns checkpoint reuse, build, diff validation, staging, and commit. Do not stage manually, run blocking wrappers concurrently, stage `tasks/**`, amend, or replace closeout unless the user requests it.

If closeout fails, debug only the failed stage. Fix local defects and rerun closeout. Return to preflight when the failure identifies the wrong owner, topology, proof scope, or runtime boundary.

## Final Report

Report:

- the change
- every required QA and closeout command as `passed`, `failed`, or `not run`
- the checkpoint risk level, `no classified change seams detected`, or `not run`
- each review result, or `not required` with the executor's implementation-specific reason
- the escaped-defect QA decision for an escaped-defect task

After the fourth closeout attempt, also report the repeated causes and resulting documentation or guardrail changes.
