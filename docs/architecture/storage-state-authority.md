# Storage state authority

This document owns state classifications and persistence authority. [Persistence contracts](persistence-contracts.md) owns database admission, versions, migration, and recovery.

## State classes

- Authoritative state drives user-visible or privileged behavior. Give it one persistence owner, mutation API, ordering rule, failure behavior, and recovery proof.
- Session state coordinates a bounded browser or extension lifetime. Define expiry, stale-entry handling, and storage-unavailable behavior.
- Advisory state may be rebuilt or discarded. Do not make it a prerequisite for correctness.
- Disposable state belongs to one page or runtime instance. Persist it only through an explicit mutation owner.

Do not use browser storage, IndexedDB, memory, or React state as parallel authorities. A fallback cache must identify the winning backend, reconciliation rule, and restart loss.

## Owners

`apps/extension/src/composition/persistence/infrastructure/browser-storage/index.ts` owns browser-storage adaptation and state-domain registration. Named owners under `apps/extension/src/composition/persistence/**` own cross-runtime state.

`apps/extension/src/background/storage/**` owns background-only activation caches, recovery records, history, leases, route capabilities, and scenario sessions. Keep each persisted DTO and codec with its named storage concern. Storage concerns must not import feature implementations.

Keep runtime-intrinsic project and workspace adapters in their runtime. Keep durable schemas, beta fixtures, and upgrade paths under composition persistence.

## Mutation rules

Keep `get`, `list`, `load`, and `read` operations write-free. Put repair, migration, reconciliation, expiry cleanup, and backfill in explicit mutation or maintenance owners.

Serialize read-modify-write through the state owner and reload the authoritative value before mutation. Reject stale writes in revisioned domains. Reject invalid security capabilities and leases before side effects.

Propagate authoritative write failure to the recovery owner. Apply fail-soft behavior only to advisory state with a documented policy. Restore previous visible state after a failed optimistic mutation.

Use `StateManager` only for a domain that needs registered adapters, key revisions, and durable stale-write rejection. Move a domain and remove its previous authority in the same change. Do not move secrets, temporary capabilities, bounded advisory history, or page-local state into `StateManager` for consistency alone.
