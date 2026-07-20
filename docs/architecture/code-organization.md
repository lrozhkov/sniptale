# Code organization

Sniptale is organized by runtime or package first, then by the narrowest owner that can enforce the behavior. The canonical source map is [repository overview](repository-overview.md); exact app-core classification is machine-owned as described in [shared topology](shared-topology.md).

## Dependency direction

```text
foundation -> runtime-contracts -> platform -> ui -> extension app
```

An edge may skip layers but must not reverse. Packages never import the extension app. Cross-package imports use declared `package.json#exports`; relative imports stay inside one package.

Runtime folders do not import sibling runtime implementations. Cross-runtime reuse goes through an exact package export or a concrete app-core owner. The only sanctioned runtime-to-runtime reuse is one-way: `apps/extension/src/web-snapshot-viewer/preparation/**` may consume `apps/extension/src/content/public/preparation-surface/**`.

## Owner folders

Use shallow folders that name an actual behavior, contract, state authority, UI surface, effect boundary, or workflow. Once the path owns the domain, child files use role names such as `view`, `controller`, `model`, `types`, `adapter`, `parser`, `guards`, or `test-support`; do not repeat the owner name in every filename.

Conventional roles are:

- `components/` for React presentation and local composition.
- `hooks/` for React subscriptions and view orchestration.
- `logic/` or `lib/` for imperative workflows, algorithms, factories, and support.
- `store/` for state containers and mutations.
- `storage/` or `db/` for persistence adapters and authorities.
- `contracts/` for wire and data contracts.
- `styles/` for owner-local token-driven styles.
- `test-support/` or `*.test-support.ts(x)` for owner-local fixtures and mocks.

Create an owner folder when behavior spans multiple files, combines state with effects, exposes contracts plus adapters, or has likely independent extensions. Do not add placeholder folders. Split an existing owner by independent change reason and dependency direction, not solely by line count.

## Public surfaces

Package public surfaces are exact exports. App-core cross-runtime surfaces are narrow owner paths. Runtime internals do not become public because another folder can reach them relatively.

Do not add broad root barrels, wildcard package exports, compatibility facades that hide ownership, or import-time side effects outside explicit initialization/service owners. Test support is private to its owner.

Browser APIs and messaging stay behind `@sniptale/platform` exports or an explicit app-local platform owner. External payloads remain `unknown` until a local parser or adapter narrows them. Reusable UI uses `@sniptale/ui`; product catalogs, persistence-aware controllers, and runtime interaction state remain app-owned.

## State and persistence

Durable app composition normally belongs under `apps/extension/src/composition/persistence`; background-only leases, capabilities, and recovery state stay under the background storage owner. Reads do not repair storage. Migrations, reconciliation, cleanup, mutation serialization, rollback, and failure reporting belong to explicit write owners.

Local React or page state is disposable until an explicit persistence mutation commits it. Do not introduce a second cache or storage backend as parallel authority.

## Tests

Keep tests beside their owner. Add boundary, lifecycle, stale-result, rollback, failure, and fixture-heavy cases to focused owner-local test files instead of extending a mixed hotspot. A helper may support tests but must not become a second public API.
