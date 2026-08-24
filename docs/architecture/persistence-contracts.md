# Persistence contracts

The shared product database is `sniptale-db`. Its IndexedDB version and the logical versions in `schema_contracts` form one admission contract: the physical version selects a migration path, while each domain row proves the logical format expected by its owner. The current physical version is projected in the [generated project facts](../engineering/project-facts.md); the first beta generation starts with domain version 1. Alpha database versions 1–30 are intentionally outside this graph.

`apps/extension/src/composition/persistence/infrastructure/indexed-db/schema-contracts.ts` is the exact registry for store ownership and data class. Every product store belongs to one domain. Durable authority must survive every supported beta migration; derived stores may be rebuilt only when the registry classifies them as rebuildable; operational stores require explicit restart or recovery behavior. `schema_contracts` itself is infrastructure metadata.

The database remains shared because recording publication commits recording metadata, the media mirror, asset graph, and completion outbox atomically. A domain version does not imply a separate database or weaken cross-domain transaction ownership.

## Admission and migration

Ordinary writers never initiate an upgrade while holding a mutation permit. Database readiness runs first under the exclusive persistent-data transition barrier, validates the database version, stores, indexes, and exact domain contracts, and only then admits ordinary shared mutations. Background and offscreen runtimes fail with a typed admission result when recovery is required; Gallery owns the interactive recovery surface.

Every released beta source version retains a real-browser fixture and a contiguous migration descriptor to the next version. A descriptor names changed domains and stores, source and target versions, risk, backup coverage, and additional-space estimation. Missing paths, future versions, malformed contracts, unknown quota for a space-consuming migration, and insufficient quota fail closed before the target version is opened.

Lossless IndexedDB transformations use one versionchange transaction and update domain versions only after transformed data validates. Because `idb` does not await the upgrade callback, every descriptor must synchronously enqueue its migration and validation requests and return `undefined`; a promise-returning descriptor is rejected and aborts before contract publication. Transaction abort is the interruption recovery mechanism and rerunning the same source builds the same plan. An OPFS migration must retain source objects until the new graph is durably published through a restartable journal. A destructive durable-data migration cannot run without complete source-version backup coverage; if no exporter exists, refusal is the supported behavior. An explicit recovery reset also writes fixed-metadata journal state before its first deletion, resumes cleanup after Gallery restarts, and admits a new database only after IndexedDB, OPFS, and preview-cache absence is verified.

## Alpha cut and recovery

The old `sniptale-video-db` name is retained only in the alpha-reset and privacy-erasure inventories. Gallery may run the one-time reset under the persistent-data barrier: it records a non-secret browser-storage journal, deletes the alpha database, shared alpha asset roots, and disposable preview cache, verifies absence, and then clears the journal. An interrupted reset resumes from that journal. Alpha data is neither migrated nor exported.

Recovery never repairs on read or silently resets data. Gallery exposes retry for blocked or insufficient-space states and an explicit confirmed reset for corrupt or unsupported data. A future-version database is never downgraded. Reset keeps browser-storage preferences but removes IndexedDB/OPFS user data and transition metadata.

## Change proof

Changing a database or domain version requires the registry update, a retained source fixture, the next-version fixture, a contiguous migration descriptor, deterministic post-upgrade identity proof, interruption and rerun proof, quota and backup/refusal proof, and affected runtime/UI coverage. The fixture registry intentionally makes a version bump fail focused tests until this complete set is present.
