# AGENTS.md

Compact workflow contract for Sniptale.

## Coherent Delivery

- Before a broad move, generate and validate one complete bounded manifest covering files, consumers, owners, proof, rollback, modes, digests, and collision checks. A representative sample is not a complete inventory.
- Freeze the task's acceptance criteria and explicit non-goals before implementation. Do not strengthen manifest promises or convert nearby hardening into current-wave acceptance without evidence that the original criteria require it.
- Do not start broad QA or required review until the coherent candidate and its deterministic negative proof are complete.
- Collect all review findings before editing. Confirm each finding against acceptance criteria, source evidence, and invariants, then make one consolidated correction. Repeat only proof invalidated by a changed behavior, owner, public contract, or security seam.
- Classify findings as current-wave regressions, direct acceptance blockers, provable security issues, or pre-existing hardening. Only the first three categories block closeout; record pre-existing hardening as debt/follow-up, and tell reviewers that unrelated pre-existing defects are not `Request changes`.
- Canonical proof is `qa:release-harness` when the diff has harness/shared-control targets, `qa:checkpoint`, an artifact build when its closure changes, and the affected runtime or E2E smoke.
- Canonical order: `implementation → qa:checkpoint → required review → qa:closeout`.

## No Implied Urgency

- Do not assume urgency unless the user explicitly says so.
- Quality, correctness, maintainability, security, and explicit ownership are the default priorities.
- Do not justify topology debt, temporary hacks, weaker proof, smaller diffs, or deferred cleanup by presumed time pressure.
- If the correct implementation inside the fixed acceptance scope requires a refactor, ownership split, or topology cleanup first, do that work in the same change set unless the user explicitly chooses a narrower tradeoff.

## Preflight

Before non-trivial implementation, read:

- `AGENTS.md`
- `docs/engineering/implementation-rules.md`
- `docs/architecture/repository-overview.md`

Read deeper docs only when the task touches their area:

- runtime entrypoints, browser/context routing, or cross-runtime ownership: `docs/architecture/runtime-contexts.md`
- folder topology, module roles, naming, or split strategy: `docs/architecture/code-organization.md`
- entrypoint/state-pattern divergence or platform-policy tradeoffs: `docs/architecture/platform-patterns-and-tradeoffs.md`
- translated UI, locale behavior, or locale-aware formatting: `docs/architecture/i18n-architecture.md`
- parser, snapshot, page-profile, traversal, export, or apply-back flows: `docs/architecture/parser-architecture.md`
- product UX, visual direction, interaction design, or extension-owned UI: `DESIGN.md`
- AI credentials, sensitive storage, diagnostics, tracing, or secret-bearing network headers: `docs/security/data-handling.md`
- manifest grants, host permissions, content scripts, web-accessible resources, offscreen reasons, action/default popup, or context-menu permissions: `docs/security/manifest-permissions.md`
- user-reported regressions, escaped defects, or QA blind spots: add failing proof first, identify why existing QA missed it, and decide whether the same change needs a deterministic guard improvement

Run `npm run qa:preflight` when scope is unclear or non-trivial. Use `npm run qa:preflight -- --files <paths...>` for pre-edit planning before a diff exists.

Record the owner seam, runtime boundary, target topology, likely next `2-3` seam expansions, state authorities, risk families, size pressure, transitive consumers, and expected negative/user-visible proof before editing. For a broad topology move, pin a bounded manifest with the owner/import boundary, public contracts, complete consumer set, typecheck blast radius, collision handling, rollback, negative proof, acceptance proof, and near-limit files/tests.

If preflight shows a near-capacity owner, broad public surface, flat sibling scatter, repeated-prefix names, root-facade drift, or multiple independent reasons for the same file to change, fix the shape before adding behavior. Metrics are signals, not architecture boundaries.

Return to preflight and the minimal correction class when a proposed fix starts changing new runtime contracts, all persistence writers, or dozens of additional owners beyond the accepted manifest. Expand the task only when those changes are proved necessary for the frozen acceptance criteria.

## Implementation

Keep changes inside the selected owner seam. Use canonical browser, messaging, storage, parser, i18n, design-system, and security seams instead of reaching around them. Boundary payloads from JSON, storage, IPC, browser APIs, DOM, process output, or network calls stay `unknown` until a local parser or adapter narrows them.

For runtime route changes, keep the action-kernel route registry, authorization policy registry, and drift tests synchronized. Legacy family routers are adapters; dispatch and authorization proof should run through listener/action-kernel paths.

Implement a coherent wave before running blocking QA. Use targeted commands only to investigate a specific wrapper failure, answer a focused debugging question, or satisfy an explicit user request.

Run `npm run qa:release-harness` before `qa:checkpoint` when the diff has harness/shared-control targets. This includes `tooling/**`, `.github/workflows/**`, `.agents/**`, `AGENTS.md`, hooks, QA-affecting root/package/TypeScript/Vite configuration, and active `docs/tooling/**` guidance. The live classifier is `tooling/qa/core/qa-scope.mjs`.

Run `npm run qa:checkpoint` after each substantial coherent implementation wave. It owns supported non-Markdown formatting, advisory state, focused static checks, typecheck, focused tests, and diff coverage; it does not build, stage, or commit.

Subagents may perform read-only investigation, diagnosis, or disjoint implementation work. Do not assign them `qa:release-harness`, `qa:checkpoint`, `qa:build`, or `qa:closeout`; blocking wrappers stay in the main thread.

## Required Review

Run `$security-code-review` only when the current diff actually changes a trust boundary, authorization decision, privileged API use, sanitization/import-export policy, secret handling, retention, privacy behavior, manifest permission, or MV3 lifecycle authority. Run `$architecture-code-review` only when the current diff actually changes runtime ownership, state/public contracts, dependency direction, parser semantics, UI/i18n/design-system ownership, or notable topology. Low-risk owner-local extraction, test/proof-only changes, literal clone removal, and mechanical moves that preserve those seams do not require independent review; report `not required: low-risk change`. Use `$topology-plan-review` before implementation to validate a large move plan or after green proof to review the completed move.

Required closeout review runs only after the complete candidate, deterministic negative proof, applicable green harness proof, and green `qa:checkpoint` exist. Invoke it as an independent read-only agent without inherited context. Supply explicit scope, bounded manifest/completion matrix, preflight shape, and QA result; do not pass intended conclusions.

Collect all findings, classify them with the four finding categories, confirm blockers against evidence and the frozen acceptance criteria, and apply one consolidated correction. A reviewer may not turn an unrelated test wish or stronger guarantee into a blocker. Do not repeat review after mechanical cleanup unless the correction changed the reviewed behavior, owner, public contract, dependency direction, parser semantics, or security seam. Rerun only proof invalidated by the correction.

Expect QA or review to reject dual authority, write-on-read repair, blind overwrites, stale async results, missing rollback/failure surfacing, raw privileged effects outside canonical owners, unsafe boundary casts, broad controller/state/props bags, hidden multi-transport orchestration, topology-only line splitting, dead exports/cycles, i18n/design-system bypasses, and success-only proof for failure-prone seams.

## Closeout

Normal implementation flow:

1. implement a coherent phase
2. run `npm run qa:release-harness` when harness/shared-control targets changed
3. run `npm run qa:checkpoint`
4. fix checkpoint failures and restore green proof
5. obtain required independent review when the changed seam is high risk
6. apply one consolidated correction and rerun only invalidated proof/review
7. run `npm run qa:closeout -- -m "<commit message>"`

`qa:closeout` reuses a fresh matching checkpoint or runs one, invokes `qa:build`, validates the unchanged diff and task-artifact policy, stages allowed changes, and commits only after the build is green. It requires a fresh harness stamp whenever the live diff has harness/shared-control targets.

Do not run a manual closeout chain, manually stage the candidate, start another blocking wrapper while closeout runs, stage `tasks/**`, or amend an existing commit unless the user explicitly requests it.

If closeout fails, fix local implementation defects in the current seam; return to preflight when the failure exposes wrong ownership, topology, proof scope, or seam choice; use targeted debug commands only for the failed stage; then rerun the single closeout wrapper.

Authored Markdown uses natural paragraphs without hard wrapping. Do not run formatters that reflow Markdown. License and generated legal text stays byte-for-byte under its canonical generator or digest owner.

## Final Report

Final delivery summarizes what changed, the closeout command and result, review status (`not required: low-risk change` or the required review result), and the escaped-defect/QA-improvement decision when applicable. If closeout needed more than `2-3` attempts, include the repeated-failure causes and concrete documentation, preflight, wrapper-feedback, or guardrail improvements.
