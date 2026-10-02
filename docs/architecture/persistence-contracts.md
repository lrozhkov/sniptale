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

The lifecycle owner serializes move, restore and permanent deletion with a cross-runtime lock. A confirmed manual permanent deletion is bound to the observed lifecycle revision and active/Trash state, and rechecks both under that lock before invoking the deletion owner. Active materials can be deleted permanently without an intermediate Trash mutation. Trash cleanup remains bound to the observed trash timestamp. A concurrent move or restore invalidates the stale manual confirmation. Restore clears the marker and restarts temporary retention timing. Metadata edits and publication recovery preserve the authoritative marker.

Trash cleanup is independently disabled by default. When enabled in storage settings, items expire after the selected number of days since moving to trash (1, 3, 7, 14, 30, 60, 90, 180 or 365; initial choice 30). The explicit Gallery refresh workflow checks expiry on opening and refreshing Gallery. No browser wakeup schedule is implied. Referenced media remains retained; cleanup failures retain remaining items and show retry feedback. Manual permanent deletion and emptying trash require confirmation and the existing project dependency checks. Privacy erasure still removes trash along with all local media.

Trash-driven video-project deletion preserves independently published export media, including active/restored exports and exports with a newer trash timestamp. Each export is purged through its own media root. Empty Trash deletes confirmed project roots before their selected source media; dependencies outside the confirmed batch still block primary-source deletion, and the media owner revalidates remaining references before mutation.

Scenario-export catalogue records own optional `trashState` metadata independently of their source project. Legacy records without that marker start active; Gallery projects destination class from the source project but never projects its Trash marker. Moving or restoring a catalogue record does not mutate the source project. Permanent catalogue deletion removes only that record and its thumbnail, preserving source resources and sibling exports. Parent aggregate deletion keeps its project-local catalogue cascade; a confirmed bulk parent deletion subsumes its selected catalogue children.


Library project dependencies distinguish external consumers from aggregate-owned workspaces. A media root's own quick-edit workspace is deleted with that root and does not block its deletion or unattended retention cleanup. External video primary sources remain protected. Scenario cascades acquire the resource gate once and then all affected project locks in deterministic order; an open editor or active resource reader refuses the whole mutation before writes.

Importing a Library image into a scenario reuses pristine immutable sources when possible. Rendered or edited Library images become project-private snapshots with source provenance in `galleryAssetId`; aggregate publication and backfill do not publish another Library card for those snapshots. Direct imports and explicit independent publications retain their own Library identities. This policy does not consolidate previously published identities or independent user imports by content.

Expected media deletion refusals retain fixed domain codes through the persistence error wrapper. Gallery translates those codes into recovery guidance without exposing raw error messages, resource paths or source metadata in diagnostics. Invalid graph entries continue to refuse destructive mutation.

Deletion validates the affected dependency graph rather than unrelated presentation metadata. A malformed row may be left untouched only when its dependency locators prove it disjoint: scenario child source identities, scenario root IDs outside related children, or a validated version-2 video dependency envelope with no matching source. Missing or ambiguous locators and related invalid documents still refuse deletion. Own quick-edit sidecars are purged with their media root without being admitted as external projects; auxiliary quick-edit dependencies admit only project-assets. Invalid-graph feedback identifies the affected domain through fixed diagnostics, without source content or record identifiers.


Video disjointness admission parses primary origin, base recording and every asset source independently of timeline, effects and asset presentation metadata. It refuses unsupported versions, legacy template markers, unknown source kinds and missing dependency slots. The full project parser still admits every related project before mutation. Project documents remain the authoritative source of links written on asset addition; this read projection introduces no persisted reverse index or parallel authority.

A scenario child imported from a Library identity remains a deletion dependency through `galleryAssetId`, including a private rendered or edited snapshot without `borrowedMediaId`. Byte ownership and deletion membership are distinct: the snapshot owns its bytes but manual permanent deletion of its source Library card removes that imported resource and its retained project references. Usage warnings and transactional cascade include the same identity; independent imports without that source identity remain untouched. This applies to direct permanent deletion of active materials as well as Trash deletion.
