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

## Media identity, dependencies and deletion

This map covers Library media, image editing, quick video editing, video montage, scenarios (guide/tour), Page Packages and saved exports. This document owns database admission. [Storage state authority](storage-state-authority.md) owns mutation authority.

### Identities and ownership

| Entity | Identity and authority | Meaning |
| --- | --- | --- |
| Immutable bytes | `AssetRef.assetId`; `asset_refs`, physical adapter | A byte object, independently of a Library card or project. OPFS location is storage metadata, not a project reference. |
| Byte owner | `asset_owners[ownerKind, ownerId, role]` | Explicit retention of bytes. Multiple owners may share one object. Last-owner removal records a physical-delete intent. |
| Library material | `MediaLibraryEntry.id`; `media_library` | User-visible material and its lifecycle. Its source selects the byte owner, not whether its project uses can be deleted. |
| Project resource | Scenario child ID or video asset ID/source | A placement/resource identity. It may use shared bytes or a frozen representation; neither operation should accidentally publish another card. |
| Editing workspace | Media aggregate ID, or scenario editor-document ID | Content, history and auxiliary byte ownership. A root's own workspace is part of that root; another workspace using the material is a consumer. |
| Independent export/copy | Its own published identity | Retained content with its own lifecycle. The origin project or filename is provenance, not shared ownership of the resulting file. |

An insertion into a project retains a Library identity relationship even when rendering requires a frozen representation. Private `project_assets.originMediaId` records that relation during acquisition, before a video placement is saved. The placement repeats it for portable source resolution. New source locators are admitted against their owner rows in the project-save transaction; unchanged legacy missing locators do not prevent unrelated edits. An explicit independent publication introduces a new identity. Filenames, MIME types and equal bytes never establish identity. Provenance alone must not be mistaken for byte ownership.

### Library source inventory

| `source.kind` | Durable source | Root byte owner | Deletion |
| --- | --- | --- | --- |
| `screenshot` | Inline `media_library.blob`, including imported image roots | Root row; editing document owns additional objects | Delete graph and root/sidecars in one transaction; no OPFS source owner to release. |
| `stored-asset` | `asset_refs[source.assetId]` | `media-library/rootId/source` | Release that owner after project detach; retain shared objects. |
| `recording` | `recordings[recordingId]` plus telemetry | `recording/recordingId/body` | Primary video-project sources block manual deletion; auxiliary uses detach. |
| `project-asset` | `project_assets[projectAssetId]` | `project-asset/projectAssetId/body` | Detach consumers, delete source record, release owner. |
| `project-export` | `project_exports[exportId]` | `project-export/exportId/body` | Treat exported bytes as an independent material; do not delete the originating project. |
| `web-snapshot` | `web_snapshots[snapshotId]` | `web-snapshot/snapshotId/package` and `/screenshot` | Release both objects in the same transaction; preserve unrelated captures. |

Presentation records, thumbnails, review drafts and the root's image/quick-edit workspace are aggregate sidecars. They disappear with the root and are not external primary uses.

### Project and document inventory

| Container | Live reference locations | Retained locations | Removal owner |
| --- | --- | --- | --- |
| Scenario guide | `scenario_assets` membership; step image `assetId`, `editDocumentId` | `ScenarioProjectEntry.history[].project` | Scenario asset reference removal and aggregate child mutation |
| Scenario tour | Image slides, navigation background images, audio resource list, slide/object narration (hotspots, annotations, masks, buttons) | Saved project history | Same scenario owner; image slots/narration are cleared, unrelated text/timing retained |
| Scenario Library import | `borrowedMediaId` or `galleryAssetId`; original published child identified by stored source and child ID | Resource child itself survives even without current placement | Shared dependency projection plus scenario owner |
| Video montage | `assets[].source` (`library-asset`, `recording`, `project-asset`, `scenario-asset`); `baseRecordingId` and recording origin | Assets remain dependencies even without clips | Video source removal strips clips, embedded images, backgrounds, transitions, source effects, cursor/action/object anchors |
| Quick video editing | Voiceover/music asset IDs and image background | Advanced-content undo/redo and recovery snapshots | Review asset-reference collector/remover; media root itself is protected/removed by its root owner |
| Image editing | Document asset bindings and immutable objects | Current persisted editable document; presentation is derived | Document byte ownership owner; edit snapshots carry their own byte objects, not raw Library IDs |
| Page Package | Sanitized archive and screenshot object IDs | The package body is an immutable capture | Web Snapshot source owner |
| Saved scenario HTML | Independent export catalogue and immutable HTML body | Historical exact output, not reconstructed source content | Scenario export-artifact owner; catalogue deletion preserves project resources |
| Saved video export | Independent Library root and export source row | Rendered output bytes | Export source owner; origin montage deletion preserves independently published output |

Step templates and guided-tour variants share the scenario aggregate. Camera/recording sidecars are recording identities. There is no separate schema for a screenshot merely because its UI material kind is `image`.

### Operation policy

| Operation | Project links | Byte ownership | Library cards |
| --- | --- | --- | --- |
| Add Library material to project | Record stable source identity at insertion; reuse an existing project resource on repeat insertion | Borrow immutable object, or own a private frozen representation | One source card; insertion does not imply independent publication |
| Import a new local file | Create a new material identity | Publish immutable bytes and source owner | One new identity; content hash does not merge independent imports |
| Edit | Preserve root/resource identity and history policy | Replace immutable representation through publication journal | Update existing card |
| Move to Trash / restore | Preserve aggregate and dependencies | Preserve owners/bytes | Hide/restore same card, bind operations to lifecycle revision |
| Confirm permanent delete, active or Trash | Compute warning; lock/revalidate; detach confirmed non-primary dependencies | Release root/children owners and unshared private review auxiliaries atomically; physical journal after commit | Remove root and sidecars |
| Automatic expiry | Never detach project uses; unknown/related dependencies retain material | Release only proven standalone expired graph | Same source rules; independent opt-in retention policy |
| Delete a project | Remove aggregate-owned children; retain private rows used by scenarios, other montages or review history; rehome scenario children still used by video projects | Release project/document owners only; advance revisions of changed video workspaces | Preserve independent source/export cards |
| Duplicate/import backup | Restore published materials as separate roots in dependency order; nested `libraryMediaId` binds to the remapped root; private origins remap too | Validate explicitly shared bytes in bounded chunks; retain nested private publication intent | One card per published root; old metadata keeps its historical publication default |

### Authoritative mechanism

The media dependency projection owns identity matching, used by warning/inspector, manual transaction and automatic-retention checks. Domain owners enumerate their reference-bearing content and remove it; they do not independently decide whether a Library source kind permits a cascade. Project documents and resource children remain authoritative. No cached counter or second persisted reverse index participates in destructive admission.

Manual deletion has one orchestration owner and one IndexedDB commit: read source/dependencies, admit related documents, apply domain removers, compare confirmed dependencies, remove sidecars/source owners, record physical intent, commit. A stale confirmation or a failed write aborts the whole transaction. Busy scenarios refuse before mutation. Related invalid records or ambiguous locators retain data; unrelated rendering metadata does not decide dependency existence.

Storage backends must remain below this graph. A future WebDAV adapter needs remote object identity, account/credential boundaries, availability and conflict policy, durable delete/retry receipts and recovery proof. It must not become a second project-link authority or cause UI/project owners to issue remote deletes. Current `AssetRef.location` supports OPFS only; this task does not claim remote storage support or silently extend that persistence format.

### Defects discovered by the inventory

The former manual router admitted recording/project-asset/stored-asset but rejected linked screenshot/export/Web Snapshot roots. Warning and mutation duplicated source matching. Automatic temporary cleanup tested only scenario `borrowedMediaId`, while manual deletion included imported snapshots via `galleryAssetId`. Derived montage insertion published another Library card and retained only origin metadata. These are reachable differences in the same user operation, not distinct intentional deletion policies; acceptance proof must cover the caller, source owner and project representation together.

### Implementation consumers and proof

`composition/persistence/media-library/dependencies.ts` owns source identity predicates and acquisition projection. Library usage, cascade, automatic expiry and project-private release consume them. Own-review auxiliaries enter the same private release queue for manual deletion, expiry, parent montage detachment, orphan acquisition cleanup and standalone archive replacement; independently published or externally used nodes remain. Archive replacement protects invalid external consumers and the auxiliary closure of retained workspaces. Scenario reference removal owns scenario content/history; video source removal owns montage placements; review collection/stripping owns quick-edit history. `delete-cascade.sources.ts` owns source release and media sidecars; source publication owners retain journal authority. Archive inventory closes the same explicit identities; publication reuses only explicitly remapped published roots. Prepared sharing and private origin bindings are readmitted in the consumer transaction before any replacement/publication write; an origin published with its own root is admitted as part of that atomic graph.

Regression proof covers all six source variants, direct and Trash deletion, stale previews, unrelated/related invalid graphs, primary recording protection, scenario membership/history/narration, copied montage resources, acquisition before placement, private publication and replay, external consumer retention, shared byte owners, selected archive dependency closure, private restore, shared-root restore and dependency order. Tests target graph admission and mutation outcomes rather than content-based deduplication.

### Executable mutation routes

The operation inventory includes every direct persistence writer and delegated public mutation API, not only the permanent-delete router. Store abbreviations in this table describe participants, not optional stores: M=Library, V=montage, A=project asset, X=video export, R=recording, S/C/D/H=scenario root/resource/document/HTML, W/Q=quick edit current/recovery, I=image workspace, P/T=presentation/thumbnail, F/O/J=byte refs/owners/operations, B=Web Snapshot, E=telemetry. Concrete store lists belong to each transaction owner.

| Operation route | Transaction / owner | Admission, retention and failure rule |
| --- | --- | --- |
| Image capture/import/editor save/copy | `index.screenshots`, `image-aggregates/mutations`; M/I/P/F/O/J | Root and document ownership commit together, abort/drain on logical failure. Existing-root editor saves cannot recreate a purged material at revision zero. New drafts explicitly create roots. |
| Private acquisition / independent project output | `projects/asset-publication`; A or X/M/F/O/J plus consumer stores | Explicit publication intent; frozen acquisition preserves origin without another card. New immutable-source replacement admits all consumers; expected prior byte ID protects against stale ready replay. |
| Recorder batch / completion | `recordings/asset-publication`; R/M/F/O/J + completion outbox | Whole batch and outbox commit atomically. Exact-byte replay does not rewrite user metadata/Trash or recreate consumed completion. A ready journal owns failure recovery. Supplied staging objects do not re-enter transition recovery while holding its lease. |
| Web package publication | `web-snapshots/publication`; B/M/T/F/O | Package and screenshot roles commit together. Late role conflict aborts earlier writes; exact-source replay preserves root metadata/lifecycle. |
| Scenario save / child replace / history prune | `scenario/aggregate-mutations`, `retention`; S/C/D/V/A/M/F/O/J | Current and saved history retain resources. Removing or replacing a child transfers externally used montage representations to private A before release, retaining parent provenance. Open sessions defer prune. |
| Montage save / detach | `projects/index`, `asset-references`; V plus source/dependency/sidecar/F/O/J stores | Admit new source locators in the same transaction. After parent mutation, recursively release private resources against the final consumer graph, including nested own review history. |
| Quick edit current/history/recovery | `review-workspaces/store`; M/W/Q/R/A/X | Owner revision and compare-and-swap; current/history/advanced/recovery locators remain authoritative. Prepared voiceover admission is a durable staging claim, not implicit card publication. |
| Editable document assets | `document-assets/ownership`; F/O/J inside image or scenario parent transaction | Retain all next immutable bindings before unlinking previous bindings. Editor-layer byte IDs do not imply Library identity. |
| Rename/tags/promote | Library/scenario/video metadata owners | Preserve source identity and owners. Compound promotion keeps mirrors consistent. Compatibility upsert changes existing metadata only, not source/publication/lifecycle authority. |
| Trash / restore | `library-lifecycle/trash`; M/S/V/H | One lifecycle lock and transaction; no byte/source unlink. Purge rechecks the observed active/Trash revision. |
| Manual permanent delete | `media-library/delete-cascade` | One graph transaction: confirm/revalidate, strip all admitted project/history/resource links, release sidecars/source owners, append physical intent. Related invalid/ambiguous graph and primary recording uses refuse without writes. |
| Montage/scenario parent removal | `projects/index.delete`, `scenario/aggregate-cleanup` | Remove parent-owned graph; preserve independent outputs and externally adopted private resources. Scenario source transfer shares immutable bytes and publishes no card; invalid relevant children retain evidence. |
| Automatic expiry / temporary cleanup | `library-lifecycle/cleanup` | Same dependency projection and private release queue; never detach a retained project. Adopted or ambiguous sources remain. |
| Recording/export/Web lower deletion | Source compatibility APIs → common media deletion with empty expected consumers | Exact source identity and zero consumers required. Used by cancellation/cleanup; cannot implicitly perform user-confirmed detach. Missing/invalid source does not authorize deleting an identifying mirror. |
| Scenario HTML catalogue | `scenario/projects/exports`, `export-artifacts`; H/F/O/J | Independent catalogue root, not a MediaLibrary source. No supported child locator references HTML. Parent removal uses its explicit catalogue cascade policy. |
| Archive independent material root | v6 `root-publication/media`; applicable source/dependency/sidecar/F/O/J stores | Explicit whole-root version replacement preserves logical source locator. Live project locators keep that identity; frozen resources keep their own old byte owners. Scenario resources become explicit frozen representations with `galleryAssetId` before replacement, retaining the same material relationship without retargeting their bytes. Canonical scenario identity remains logical membership even when its root version has different bytes. Archive export records that frozen relationship for legacy canonical resources too, so restoration does not falsely require byte sharing. Source-kind/locator substitution under the same root ID is refused. |
| Archive montage/scenario root | Domain backup participants inside v6 root transaction | Validate existing replaced rows; private source replacement protects all external consumers. Montage uses final-graph recursive release; scenario uses the same external representation transfer as save/prune. Scenario restore distinguishes frozen gallery membership from canonical publication collision checks; explicitly borrowed objects retain strict source-byte admission. Root and archive checkpoint commit atomically; abort/drain on failure. |
| Archive skip/duplicate/shared restore | v6 restore orchestration, codecs, binding admission | Dependency order and explicit `libraryMediaId` remapping; inline legacy data cannot silently overwrite an adopted private source. Validate shared byte content in bounded chunks and readmit bindings in the consumer transaction. Archive is resumable per root, not globally atomic. |
| Publication retry / cancellation | `assets/publication`, `recovery`; ready + J then physical owner | Known superseded publication becomes a durable cancellation intent; legacy ambiguous replacement stays ready. Never detach projects to cancel staging. |
| Physical-delete replay | `assets/operations`; J/F/O + ready claims | Existing lifecycle lock with explicit reusable permit. Recheck current byte owners and the shared read-only projection of retained source/document metadata, declared ready document/resource claims and unresolved legacy rollback receipts before I/O; adopted objects stay, ambiguous objects retain intent for recovery. |
| Orphan audit / legacy recovery | `asset-publication-recovery` | Actual/projected source owners and unresolved rollback receipts retain objects even with missing refs. Invalid operation authority defers physical deletion; valid multi-owner sharing is allowed. Legacy compensation readmits current source/consumers/receipt-scoped ownership before rollback; ambiguity keeps receipts. Post-ready cleanup uses the common physical owner. |
| Legacy Library synchronization | `index.legacy-sync`, scenario backfill | Refresh explicit R/X or existing A mirrors only; no private auto-publication or flat stale deletion. Active scenario backfill skips borrowed/gallery representations. |

Service policy and explicit replacement policy differ deliberately. Ordinary source publication cannot retarget an adopted immutable representation. Explicit archive material replacement is the user-selected replacement of a published root version; it preserves logical identity and separate frozen owners. Project-private replacement still requires external-consumer admission, because private source IDs are immutable representations held by those consumers.

`assets/retention-authority.ts` owns the shared read-only metadata snapshot and expected byte-owner projection used by physical replay and orphan audit. Missing ref/owner rows do not erase a retained source or document claim; ambiguous metadata preserves the object and physical intent. Domain parsers remain the format authorities.

Logical commit and physical deletion are separate phases. A committed logical deletion cannot be rolled back by a disk failure. A durable physical intent remains until deletion or proven adoption completes; inconsistent owner/ref evidence retains bytes and intent instead of discarding evidence. Source or related project ambiguity refuses the logical transaction itself. Pure pre-ready discard and quiescent writing collection belong to the object adapter; post-ready cancellation belongs to the durable intent owner. All deletion paths respect the same distinction.

### Inventory coverage and deliberate exclusions

Scenario resources admit image and audio, not direct video/export/Web/HTML resources. Quick edit admits video roots and auxiliary audio/image assets; auxiliary audio is not an audio-root workspace. Image documents admit image objects, not arbitrary media roots. Unsupported matrix cells remain unsupported; conversions that produce an image are image acquisitions with explicit provenance.

Direct byte deletion is limited to committed physical intents, audited unowned objects, and the object adapter's pre-ready/quiescent staging cleanup. Domain owners never directly delete committed objects. Configuration presets/effects/settings/tags, derived caches, temporary native transfer chunks/export input handles/render/bootstrap payloads and diagnostics are separate authorities, not selective material source removal. Privacy erasure is intentionally the exclusive full-database/full-object reset and cannot preserve a selective graph.

Proof follows operations and their consumers: all six source kinds; all admitted container locations and saved histories; direct and Trash purge; acquisition/publication; child/parent deletion and prune; archive skip/duplicate/replace; late logical errors with abort; stale/duplicate/legacy replay; three-level nested release; independent/frozen/shared-byte retention; missing/malformed source and owner evidence; physical failure and retry. Lexical/AST inventories and file digests establish route coverage, not test success. The escaped defects were missed by separate domain implementations and mocks without logical-error abort semantics; deterministic route-level graph/rollback/replay proofs are required rather than a heuristic text-only guard.
