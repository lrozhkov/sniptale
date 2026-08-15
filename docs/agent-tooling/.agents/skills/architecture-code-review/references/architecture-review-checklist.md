# Architecture Review Checklist

## Severity

- `P0`: architecture failure capable of data loss, widespread runtime failure, or an impossible-to-close privileged workflow.
- `P1`: runtime-boundary break, shared/public contract drift, dual authority, unsafe parser contract, or missing recovery/failure behavior at a reachable material partial-failure point in a core seam.
- `P2`: meaningful owner-shape, proof, lifecycle, or maintainability risk with a concrete reachable path to regress accepted or currently supported behavior.
- `P3`: low-risk cleanup, naming, local split, or documentation alignment issue.

## Runtime And Ownership

- Runtime folders do not import each other directly. Cross-runtime reuse uses `@sniptale/*` packages, typed contracts, browser adapters, messaging, persistence, i18n, theme, and reusable UI owners.
- Entrypoints, page shells, app shells, and public facades stay thin. Runtime route, authorization-policy, and drift registries stay aligned.
- Paths own domains and filenames own roles. A split must reduce real owner complexity rather than move the same broad contract, state authority, or effect surface into neighboring files as a distributed god-object.
- Review the owner/change-reason cluster, not raw files in isolation. A valid `Split`, `Consolidate`, or `Keep` result reduces cognitive/navigation load without erasing runtime, owner, adapter, or public-contract boundaries. Fewer files alone is not evidence.
- Structural pressure is interpreted with ownership and cohesion. A registered transaction/workflow owner may legitimately coordinate validation, commit, rollback, publication, state, and effects through narrow adapters; flag it only when responsibilities cross domains, UI authority leaks in, or arbitrary branching erodes the boundary.
- Compare before/after file transitions, facade/proxy/pass-through layers, public contract size, state authorities, effects/recovery placement, cohesion, and independent change reasons. Consolidation stays within one owner and shared change reason.
- Treat a supplied forwarding-only plus single-production-consumer edge as a direct consolidation candidate, even when fixed path-depth clusters place its modules separately. Require a stable non-forwarding merge target or explicit public-contract, runtime, cross-owner, unresolved-topology, or independent-change-reason `Keep` proof.
- Shared placement is proven by consumer symmetry. Runtime-specific UI, controller, effect, storage, or authority concerns remain with their runtime owner or behind a narrow shared contract and runtime adapter.

## Scenario Admission

- Frozen acceptance and existing material invariants define required behavior. An unmentioned edge case or hypothetical future extension is not current scope merely because it is imaginable.
- A finding that requests a new branch, state, retry, fallback, compatibility path, rollback, replay guard, stale-result guard, recovery mode, or proof names the concrete trigger, how it is reachable in the current supported flow, its material impact, and the acceptance criterion or invariant that admits it.
- Rare material trust-boundary, security, privacy, authorization, hostile-input, and irreversible data-loss risks remain in scope. Do not report rare low-impact or recoverable cases without an observed or contract-backed trigger unless the user explicitly requested a speculative-hardening inventory.
- Known accepted adjacent changes may expose an immediately brittle owner placement, but hypothetical future changes do not justify speculative abstractions, configuration, contracts, or state.

## Contracts And Boundaries

- Public/shared changes include complete transitive-consumer discovery and proof.
- JSON, storage, IPC, DOM, browser, ZIP, process, and network payloads remain `unknown` until parsed.
- Shared contract/video-type owners use `const object as const` plus union types instead of new enums.
- Raw browser APIs, runtime messaging, storage, fetch, and DOM effects stay in their canonical owners.

## State And Lifecycle

- Authoritative, advisory/cache, and disposable state are explicit; there is no dual truth.
- Read paths are read-only. Repair, reconciliation, and migration writes have explicit write owners.
- Persistence mutations define rollback or compensation when a reachable non-atomic sequence can partially commit; otherwise they use the narrowest typed error or documented fail-soft behavior required by current semantics and do not lose concurrent fields through blind overwrites.
- Async refreshes, deferred effects, and background replies guard against stale results when the current flow permits competing results and ordering changes the accepted outcome.

## Parser, UI, And Design

- Parsing follows `PageProfile -> PageSnapshot -> ParserPipeline -> ParsedDocument -> Projectors`; exporters and apply-back flows consume snapshot/profile/IR/projector output rather than live DOM state.
- Reusable UI goes through `@sniptale/ui` (`packages/ui/src/**`); runtime UI stays app-local and i18n-adopted surfaces do not reintroduce hard-coded copy.
- Floating or portaled UI has one owner for placement, pointer blocking, `Escape`, dismissal, focus, theme inheritance, and underlying-state restore.
- Hidden/restored or mounted/unmounted flows prove the first visible render after restore.

## Proof

- Proof follows the risk and consumers, not only the edited files.
- Persistence changes cover only reachable affected operations among create/load/update/delete, duplicate/clone, project deletion, bootstrap/fallback, owner mocks, and failure paths.
- UI lifecycle, parser, messaging, and persistence changes cover failure, duplicate, replay, stale-result, rollback, or restore only when the changed control flow exposes that distinct state and its impact is material to acceptance or an invariant. Do not invent behavior to complete a symmetric test matrix.
- Repeated observed defects or accepted-invariant violations with a common low-noise signature should graduate into advisory inventory or deterministic gates with narrow owner-named policy.

Request changes for runtime-boundary bypass, dual authority, write-on-read repair, a reachable stale overwrite risk, unsafe public/parser widening, generic hidden multi-transport orchestration, success-only proof at an evidenced material failure point, a mechanical/distributed split that preserves the same broad owner contract, or consolidation that creates cycles, cross-owner imports, broad bags, forwarding layers, dead exports, generic helpers, or mixed UI/privileged effects. Omit hypothetical future scenarios and stronger unaccepted guarantees unless the user explicitly asks for them.
