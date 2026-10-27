# Storage state authority

This document owns state classifications and persistence authority. [Persistence contracts](persistence-contracts.md) owns database admission, versions, migration, and recovery.

## State classes

Classify state by the first matching rule for its declared lifetime:

- Advisory state may be rebuilt or discarded during that lifetime without changing correctness. Do not make it a prerequisite for correctness.
- Disposable state is non-advisory state needed only by one page or runtime instance. It has no contract after that instance ends.
- Session state is non-advisory. It must span runtime instances within one bounded browser or extension lifetime. It expires at that boundary. Define expiry, stale-entry handling, and storage-unavailable behavior.
- Authoritative state is the accepted source of truth for a domain outcome that does not match a shorter-lived class. Give it one authority, mutation API, ordering rule, failure behavior, and recovery proof. Persist it only when its declared lifetime crosses a restart or storage boundary.

User visibility and privileged use are not state classes. Give every class one mutation authority and explicit failure behavior appropriate to its lifetime.

Do not use browser storage, IndexedDB, memory, or React state as parallel authorities. A fallback cache must identify the winning backend, reconciliation rule, and restart loss.

## Owners

`apps/extension/src/composition/persistence/infrastructure/browser-storage/index.ts` owns browser-storage adaptation and state-domain registration. Named owners under `apps/extension/src/composition/persistence/**` own cross-runtime state.

`apps/extension/src/background/storage/**` owns background-only activation caches, recovery records, history, leases, route capabilities, and scenario sessions. Keep each persisted DTO and codec with its named storage concern. Storage concerns must not import feature implementations.

Keep runtime-intrinsic project and workspace adapters in their runtime. Keep durable schemas, beta fixtures, and upgrade paths under composition persistence.

## Mutation rules

Keep `get`, `list`, `load`, and `read` operations write-free. Put repair, migration, reconciliation, expiry cleanup, and backfill in explicit mutation or maintenance owners.

Serialize the complete read, mutation, and write sequence through the state owner. Through that owner, reload the authoritative value before mutation. Reject stale writes in revisioned domains. Reject invalid security capabilities and leases before side effects.

Propagate authoritative write failure to the recovery owner. Apply fail-soft behavior only to advisory state with a documented policy. Restore previous visible state after a failed optimistic mutation.

Use `StateManager` only for a domain that needs registered adapters, key revisions, and durable stale-write rejection. Move a domain and remove its previous authority together in the same change. Do not move secrets, temporary capabilities, bounded advisory history, or page-local state into `StateManager` for consistency alone.


## AI configuration and mounted choices

The [AI graph owner](../../apps/extension/src/composition/persistence/ai-settings/graph-mutations.ts) owns saved providers, model configuration and scenario selections. Manual properties, enabled state and explicit retirement permission remain user configuration. Canonical voice preferences retain their existing settings owner. Pages do not maintain a second durable graph or global-default authority.

The graph retains catalog facts as provider evidence. They constrain capability and lifecycle eligibility without authorizing source access, credential use or egress. Do not discard known lifecycle evidence in a read path. Refresh and reconciliation use the existing graph commands. Operation observations are advisory feedback. They do not disable configuration or prove model retirement.

Persisted revisions, incarnations and generations supply ordering authority across runtime restart. Runtime request coalescing is advisory and can disappear with the worker.

The mounted interface choice and request approval are disposable. Their lifetime ends with that interface. A remembered unavailable name is presentation data with no execution context. Another window's preference cannot replace the mounted choice. See [AI persistence](persistence-contracts.md#ai-settings-graph-and-alpha-reset) for reset and reconciliation rules.

## Page recovery

The background recovery owner stores one opaque set for each tab with native session proof. Its local key is `sniptale_page_recovery`. The session key `sniptale_page_recovery_claims` binds native tab and document identities to private nonces and producer leases. Content cannot select these native identities or read another tab's set.

The service serializes complete operations. A replacement document or acknowledged discard invalidates the previous lease. Discard deletes the private set before the local Reset or Close action. Failed writes retain the last acknowledged set. Failed deletion retains current page edits and permits another explicit attempt.

Session proof survives a service-worker restart. A complete browser restart deletes that proof. Recovery then refuses every previous set, including the original tab's set. It does not select an owner by URL, tab position, or claim order. Unclaimed bytes retain their original expiry.
