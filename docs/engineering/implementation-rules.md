# Implementation Rules

Updated: 2026-07-16

This document owns Sniptale implementation decisions: topology, boundaries, state, security, code shape, and proof shape. Workflow order belongs in [AGENTS.md](../../AGENTS.md), quality policy in [code-quality.md](../tooling/code-quality.md), and wrapper behavior in [wrapper-summary.md](../tooling/wrapper-summary.md).

## Preflight Shape

Before editing a non-trivial task, identify the owner seam and runtime boundary, target files/folders, likely next `2-3` related expansions, authoritative/advisory/disposable state, public consumers, and required failure/rollback/stale-result proof. Account for near-capacity files, long functions/tests, changed-line width, import-depth fallout, dead exports, cycles, i18n/design-system fallout, and test-support growth.

Freeze the original acceptance criteria, explicit non-goals, and bounded manifest before implementation. Do not add stronger manifest guarantees merely because a broader redesign is possible. Classify later findings as current-wave regressions, direct acceptance blockers, provable security issues, or pre-existing hardening; only the first three categories belong in the current correction, while pre-existing hardening is recorded as follow-up debt.

If the task would extend a broad public surface, flat sibling scatter, repeated-prefix family, root-facade implementation owner, near-capacity hotspot, or owner with several independent growth vectors, refactor the shape first in the same change set unless the user explicitly chooses a narrower tradeoff. Metrics inform that decision but do not define the architecture.

If a correction begins to change new runtime contracts, every persistence writer, or dozens of owners outside the manifest, return to preflight and find the minimal correction class inside the original seam. Expand the manifest only with evidence that the frozen acceptance criteria cannot be met otherwise.

## Runtime And Package Ownership

Runtime folders under `apps/extension/src/background`, `apps/extension/src/content`, `apps/extension/src/camera-recorder`, `apps/extension/src/effect-runtime-sandbox`, and extension/editor page roots do not import one another directly by default. The sanctioned one-way Web Snapshot Viewer preparation reuse is documented in the runtime and code-organization architecture notes. The canonical runtime set lives in `tooling/qa/core/runtime-topology.data.json`.

Cross-runtime reuse goes through explicit workspace packages or app-core contracts, adapters, messaging, persistence, i18n, theme, and UI owners. Root entrypoints stay bootstrap, dependency wiring, page/app shells, or thin public facades.

Use the current owner topology rather than inventing generic landing zones. Paths own domains and filenames own roles. Inside an owned seam, prefer role names such as `service`, `state`, `actions`, `view`, `guards`, `session-locals`, or `render-loop`; retain a repeated prefix only for a stable public entrypoint, manifest-owned path, active collision boundary, or thin compatibility facade.

Shared/public roots stay side-effect-free unless they are explicit init/service owners. New mutable services expose a factory receiving explicit dependencies; a retained default export is a thin compatibility facade over that factory-owned service, not a second lifecycle authority.

Retired broad shared facades must not be reintroduced. Import an exact package export or concrete app owner instead. Package and app-core contracts remain explicit and dependency-closed.

Heavy dependency ownership remains canonical:

- production value imports of `fabric` belong in `apps/extension/src/editor/**`; the vendored adapter lives under `apps/extension/src/editor/fabric/vendor/**`
- `dompurify` belongs in the sanitizer seam
- `jszip` is not statically imported from `apps/extension/src/content/**`

## Boundary Discipline

Messaging uses typed transport/contracts. UI, hooks, and ordinary orchestration do not call raw runtime messaging or listeners when a canonical transport exists. Runtime route authority goes through the action-kernel and authorization-policy registries; leaf owners may consume named preauthorization handles but do not re-decide authority.

Privileged browser APIs belong behind `@sniptale/platform/browser/**` or an app-local platform boundary. Product logging uses `@sniptale/platform/observability/logger` with a narrow namespace.

JSON, storage, IPC, ZIP, browser, DOM, process, and network payloads arrive as `unknown`, then are parsed and validated locally. Raw boundary casts, `any`, suppression directives, generic typed JSON readers, enum casts, and string coercion are defects unless prior owner-parser proof establishes the narrowed value. Product `as never` is limited to narrow exhaustiveness helpers.

Content parsing follows `PageProfile -> PageSnapshot -> ParserPipeline -> ParsedDocument -> Projectors`. Detection belongs in page-profile owners, pipeline/extractor composition belongs in parser pipelines, and AI-pick, Markdown, JSON export, and apply-back consume the shared parsed document/projector contracts rather than live DOM or output-specific heuristics.

## State, Persistence, And Async Safety

Every seam distinguishes authoritative state, rebuildable advisory/cache state, and disposable derived state. Do not create dual authority such as parallel local/browser storage, persisted/UI snapshots, or live-DOM/parser truth unless one side is an explicit degraded fallback or cache.

Read paths stay read-only. Repair, reconciliation, healing, and migrations use explicit write/maintenance owners. Persistence and cross-runtime mutation paths define rollback, compensation, typed failure, or documented fail-soft degradation; user-visible committed data is not silently best-effort.

Avoid blind read-modify-write and whole-object overwrites where concurrent fields can be lost. Async reads, refreshes, replies, and deferred effects guard against stale results. History/order uses an owned revision token rather than timestamps. Grouped transaction owners own both commit and cancellation/cleanup.

## UI, i18n, And Design Reuse

Inspect existing patterns before adding a component or interaction. Reusable UI goes through `@sniptale/ui`; runtime-specific UI stays app-local. i18n-adopted surfaces do not reintroduce hard-coded user-facing strings, and design-system preview copy uses i18n or typed data/copy owners.

Floating/portaled UI has one owner for semantic and visual placement, pointer blocking, `Escape`, dismissal, focus, theme inheritance, and underlying-mode restore. Hide/unhide and mount/unmount flows prove visible, hidden, restored, and first-visible-render states. Transient feedback prefers explicit owner events/tokens over derived list shape.

## Code Shape

Target `<= 300` lines per file, `<= 50` lines per function/method/test body/`describe` callback/local test helper, and `<= 120` characters for new or changed code lines outside canonical data carriers. Do not compress logic or split mechanically to satisfy a metric while preserving the same broad contract.

Prefer vertical composition and stable roles over dense expressions, `*.helpers` scatter, or broad controller/state/props bags mixing view, actions, transport, persistence, workspace, and derived state. Multi-message, multi-transport, or multi-persistence transitions need a named orchestration owner rather than a generic helper.

Use JSDoc for public contracts. Inline comments explain why: invariants, browser quirks, protocol edges, or explicit tradeoffs. Dead commented code and inline suppression directives are forbidden unless a rare exception is represented by policy and a local explanation.

## Security

Every task considers unsafe sinks, retention, secret handling, diagnostics, permission creep, and boundary trust. Forbidden by default: `eval`, `new Function`, raw `innerHTML`, unsanitized `dangerouslySetInnerHTML`, plaintext secret propagation outside explicit resolution/transport owners, unbranded privileged bypass sentinels, unsanitized diagnostic/export paths, and raw product `console.*` outside narrow tracing policy.

## Proof Shape

Proof follows affected risk and consumers rather than edited filenames. Shared/public interface changes prove transitive consumers. Persistence changes prove relevant create/load/update/delete, duplicate/clone, project-delete cleanup, bootstrap/fallback, owner-local mocks, failure, rollback, and concurrent update behavior. Parser/snapshot/traversal changes prove builders, facades, projectors, and direct orchestrators. UI lifecycle, messaging, parser, and persistence changes prove applicable failure, duplicate, replay, stale-result, rollback, and restore cases.

Test-profile cost does not redefine risk. Exact owner-direct execution is valid only when deterministic owner mappings are complete and the diff stays below the machine-owned small-change limits; public/shared, runtime, persistence, messaging, parser/export, ambiguous, or over-budget changes retain transitive affected-test discovery.

For an escaped defect, add failing proof first and record what existing QA missed, why it escaped, and whether a deterministic same-change guard improvement is warranted. Required review and wrapper sequencing remain owned by `AGENTS.md`.
