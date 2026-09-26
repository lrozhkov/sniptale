# Persistence contracts

`sniptale-db` is the shared product database. Its physical IndexedDB version selects the migration path. Each `schema_contracts` row identifies the logical format required by one domain owner. The current physical version is in [generated project facts](../engineering/project-facts.md). `sniptale-video-db` versions 1–30 are unsupported.

`apps/extension/src/composition/persistence/infrastructure/indexed-db/schema-contracts.ts` owns store ownership and data classes. Durable stores survive every supported beta migration. Rebuildable stores may be discarded. Operational stores define restart or recovery behavior.

Keep one database because recording publication commits recording metadata, media, assets, and the completion outbox atomically.

## Admission and migration

Run readiness under the exclusive persistent-data transition barrier before admitting ordinary mutations. Readiness validates the database version, stores, indexes, and domain contracts. Return a typed recovery result when admission fails. Gallery owns interactive recovery.

Retain a browser fixture and a contiguous migration descriptor for every released beta source version. Each descriptor identifies source and target versions, changed domains and stores, risk, backup coverage, and required free-space estimation. Refuse missing paths, future versions, malformed contracts, unknown required space, or insufficient quota before opening the target version.

Run lossless IndexedDB changes in one versionchange transaction. Publish domain versions only after validation. Migration descriptors must enqueue work synchronously and return `undefined`. Use transaction abort for interruption recovery. Keep OPFS source objects until a restartable journal records the new graph as durable. Refuse destructive durable-data migration without complete source-version backup coverage.

## Alpha reset and recovery

Use `sniptale-video-db` only in alpha-reset and privacy-erasure inventories. Under the persistent-data barrier, Gallery records a browser-storage journal, removes alpha IndexedDB and OPFS data plus preview cache, verifies absence, and clears the journal. Resume an interrupted reset from that journal. Do not migrate or export alpha data.

Do not repair or reset on read. Gallery may offer retry for blocked or insufficient-space states and confirmed reset for corrupt or unsupported data. Never downgrade a future-version database. Reset preserves browser-storage preferences and removes IndexedDB, OPFS, and transition metadata.

## Change proof

For a database or domain version change, update the registry, retained source fixture, target fixture, and contiguous descriptor. Prove deterministic output, interruption and rerun, quota handling, backup or refusal, and affected runtime and UI behavior.

## Gallery trash

Gallery deletion sets `LibraryLifecycle.trashedAt` on the media or project root. It retains the original storage class, aggregate graph, workspaces and immutable asset bytes. Trash is authoritative IndexedDB state; ordinary browsing, counts, tags and facets exclude it. Raw persistence enumeration and project dependency resolution continue to see retained roots. Draft cleanup excludes trash at selection and transaction time, including linked media.

The lifecycle owner serializes move, restore and permanent deletion with a cross-runtime lock. A permanent deletion is bound to the observed trash timestamp and rechecks it under that lock; a concurrent restore invalidates the stale deletion. Restore clears the marker and restarts temporary retention timing. Metadata edits and publication recovery preserve the authoritative marker.

Trash cleanup is independently disabled by default. When enabled in storage settings, items expire after the selected number of days since moving to trash (1, 3, 7, 14, 30, 60, 90, 180 or 365; initial choice 30). The explicit Gallery refresh workflow checks expiry on opening and refreshing Gallery. No browser wakeup schedule is implied. Referenced media remains retained; cleanup failures retain remaining items and show retry feedback. Manual permanent deletion and emptying trash require confirmation and the existing project dependency checks. Privacy erasure still removes trash along with all local media.

Trash-driven video-project deletion preserves independently published export media, including active/restored exports and exports with a newer trash timestamp. Each export is purged through its own media root. Empty Trash deletes confirmed project roots before their selected source media; dependencies outside the confirmed batch still block primary-source deletion, and the media owner revalidates remaining references before mutation.
