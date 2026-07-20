# Architecture Review Checklist

## Severity

- `P0`: architecture failure capable of data loss, widespread runtime failure, or an impossible-to-close privileged workflow.
- `P1`: runtime-boundary break, shared/public contract drift, dual authority, unsafe parser contract, or missing rollback/failure behavior in a core seam.
- `P2`: meaningful owner-shape, proof, lifecycle, or maintainability risk likely to create regressions or block nearby work.
- `P3`: low-risk cleanup, naming, local split, or documentation alignment issue.

## Runtime And Ownership

- Runtime folders do not import each other directly. Cross-runtime reuse uses `@sniptale/*` packages, typed contracts, browser adapters, messaging, persistence, i18n, theme, and reusable UI owners.
- Entrypoints, page shells, app shells, and public facades stay thin. Runtime route, authorization-policy, and drift registries stay aligned.
- Paths own domains and filenames own roles. A split must reduce real owner complexity rather than move the same broad contract into neighboring files.
- Shared placement is proven by consumer symmetry. Runtime-specific UI, controller, effect, storage, or authority concerns remain with their runtime owner or behind a narrow shared contract and runtime adapter.

## Contracts And Boundaries

- Public/shared changes include complete transitive-consumer discovery and proof.
- JSON, storage, IPC, DOM, browser, ZIP, process, and network payloads remain `unknown` until parsed.
- Shared contract/video-type owners use `const object as const` plus union types instead of new enums.
- Raw browser APIs, runtime messaging, storage, fetch, and DOM effects stay in their canonical owners.

## State And Lifecycle

- Authoritative, advisory/cache, and disposable state are explicit; there is no dual truth.
- Read paths are read-only. Repair, reconciliation, and migration writes have explicit write owners.
- Persistence mutations define rollback, compensation, typed error surfacing, or documented fail-soft behavior and do not lose concurrent fields through blind overwrites.
- Async refreshes, deferred effects, and background replies guard against stale results.

## Parser, UI, And Design

- Parsing follows `PageProfile -> PageSnapshot -> ParserPipeline -> ParsedDocument -> Projectors`; exporters and apply-back flows consume snapshot/profile/IR/projector output rather than live DOM state.
- Reusable UI goes through `@sniptale/ui` (`packages/ui/src/**`); runtime UI stays app-local and i18n-adopted surfaces do not reintroduce hard-coded copy.
- Floating or portaled UI has one owner for placement, pointer blocking, `Escape`, dismissal, focus, theme inheritance, and underlying-state restore.
- Hidden/restored or mounted/unmounted flows prove the first visible render after restore.

## Proof

- Proof follows the risk and consumers, not only the edited files.
- Persistence changes cover relevant create/load/update/delete, duplicate/clone, project deletion, bootstrap/fallback, owner mocks, and failure paths.
- UI lifecycle, parser, messaging, and persistence changes cover applicable failure, duplicate, replay, stale-result, rollback, and restore cases.
- Repeated low-noise review findings should graduate into advisory inventory or deterministic gates with narrow owner-named policy.

Request changes for runtime-boundary bypass, dual authority, write-on-read repair, stale overwrite risk, unsafe public/parser widening, generic hidden multi-transport orchestration, failure-prone success-only proof, or a mechanical split that preserves the same broad owner contract.
