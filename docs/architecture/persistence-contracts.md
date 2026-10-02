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

Trash is authoritative lifecycle metadata on the Library or project root. Moving or restoring a root retains its source class, aggregate, workspaces and immutable bytes. Browsing, counts, tags and facets exclude Trash; raw enumeration and dependency resolution retain it. Restore clears the marker and restarts temporary retention timing. Metadata edits and publication replay preserve the marker.

The lifecycle owner serializes move, restore and purge across runtimes. Confirmed purge rechecks the observed revision and active/Trash state under that lock; active roots need no intermediate Trash mutation. A concurrent move or restore invalidates the confirmation. Empty Trash removes confirmed project roots before selected source media and revalidates outside dependencies.

Expiry is disabled by default. Storage settings select 1, 3, 7, 14, 30, 60, 90, 180 or 365 days after moving to Trash (initial choice 30). Gallery opening/refresh performs the enabled check; no wakeup schedule is implied. Referenced or ambiguous materials remain, and failures show retry feedback. Temporary-draft cleanup excludes Trash at selection and mutation time.

Independent video exports keep their own lifecycle when their parent is removed. Scenario HTML catalogue records own optional `trashState`; legacy records start active. Destination class may come from the source project, but its Trash marker does not. Catalogue purge removes only that record and thumbnail; parent removal retains its documented catalogue cascade. A confirmed batch parent deletion subsumes selected catalogue children. Privacy erasure removes all local data through its exclusive reset owner.

## Material identity and ownership

| Entity | Authority | Meaning |
| --- | --- | --- |
| Immutable object | `AssetRef.assetId`, `asset_refs`, object adapter | Byte identity; OPFS location is storage metadata. |
| Byte owner | `asset_owners[ownerKind, ownerId, role]` | Explicit retention; several owners may share one object. |
| Library material | `MediaLibraryEntry.id`, `media_library` | Visible identity, source locator and lifecycle. |
| Project resource | Scenario child ID or montage asset/source | Placement or frozen representation, distinct from a card. |
| Editing workspace | Media aggregate or scenario document ID | Current content, retained history and document-byte bindings. |
| Independent copy/export | Its own published identity | Separate lifecycle; origin and filename are provenance. |

Project insertion preserves the source Library identity. Private `project_assets.originMediaId` records it before placement; montage locators repeat it. Scenario imports use `borrowedMediaId` for shared original bytes or `galleryAssetId` for a private frozen representation. Canonical `scenario-asset:<childId>` membership is logical identity, independent of a replaced root's byte version. Insertion/backfill does not publish another card. Explicit imports, copies and outputs may publish independent identities; filenames, hashes and equal bytes never merge them. Existing independently published identities are not consolidated by content.

### Library sources

| `source.kind` | Durable source | Root byte owner |
| --- | --- | --- |
| `screenshot` | Inline Library blob, including imported image roots | Root row; editable documents own additional objects. |
| `stored-asset` | `asset_refs[source.assetId]` | `media-library/rootId/source` |
| `recording` | Recording row and telemetry | `recording/recordingId/body` |
| `project-asset` | Project asset row | `project-asset/projectAssetId/body` |
| `project-export` | Independent export row | `project-export/exportId/body` |
| `web-snapshot` | Page Package and screenshot | `web-snapshot/snapshotId/package` and `/screenshot` |

Scenario HTML is a separate export catalogue, not a Library source kind. Its immutable output is not reconstructed from current project content. Thumbnails, presentations, review drafts and a root's own image/quick-edit workspace are aggregate sidecars.

### Reference-bearing containers

| Container | Current and retained references | Content removal owner |
| --- | --- | --- |
| Scenario guide | Resource membership, step image/document IDs, saved project history | Scenario child/content/history mutation |
| Scenario tour | Images, navigation backgrounds, audio resources and slide/object narration, saved history | Same scenario owner |
| Montage | Every asset source, primary origin/base recording, including assets without clips | Montage source remover: placements, transitions, effects and anchors |
| Quick video edit | Voiceover/music/background assets in current, undo/redo, advanced and recovery state | Review reference collector/remover |
| Image/scenario document | Immutable document bindings | Document byte-ownership owner |

Guides/tours admit image and audio resources, not direct video, Web or HTML sources. Quick edit admits video roots and auxiliary audio/image assets; image editing admits image objects. Conversions yielding an image are separate image acquisitions with explicit provenance. Unsupported combinations remain unsupported.

## Dependencies and deletion

Project documents and resource children own links. `media-library/dependencies.ts` derives the same identity projection for warnings, confirmed purge, automatic retention and private-source release; no cached counter or persisted reverse index authorizes deletion. Newly added locators are admitted against their source rows in the consuming transaction. Unchanged legacy missing locators do not block unrelated edits.

Confirmed purge locks and revalidates the graph, removes admitted non-primary uses and saved history, then removes source/sidecars/owners and records physical intent in one transaction. Primary recording uses block purge. A root's own workspace is part of that root, not an external consumer. Busy scenario sessions/readers refuse before writes; the resource gate is acquired once and project locks are ordered deterministically. Fixed domain codes provide feedback without logging source content or record identifiers.

Unattended expiry and cancellation never detach adopted project state. Parent removal preserves independent outputs and externally used private resources. Scenario child replacement/prune/removal rehomes representations still used by montages before unlinking them. Manual purge, expiry and parent/archive cleanup recursively release private auxiliaries against the final graph, including nested review history; published or external consumers remain.

Related invalid documents, missing sources and ambiguous locators retain data. Unrelated invalid presentation metadata may be skipped only when validated dependency locators prove disjointness. The version-2 montage envelope checks origin, base recording and every source independently of rendering metadata; unsupported versions, legacy template markers and unknown/missing source slots do not prove disjointness.

## Publication and physical recovery

Publication intent is explicit. Source writers own ready journals, expected-source/revision admission and replay; exact replay preserves user metadata, Trash and consumed completion events. Existing-root editor saves cannot recreate a purged root, including revision zero; new drafts create roots explicitly. Ordinary immutable-source replacement protects external consumers.

Compound parent/child writes, byte ownership, sidecars, revisions and journal checkpoints commit together. A logical exception after a successful IndexedDB request must abort and drain the transaction. Physical I/O follows commit and cannot roll it back. Failed deletion retains durable intent for retry.

`assets/retention-authority.ts` provides the read-only source/document ownership projection shared by physical replay and orphan audit. Before I/O, the physical owner rechecks actual/projected owners, ready document/resource claims and unresolved rollback receipts under the lifecycle lock with an explicit reusable permit. Missing refs/owners do not erase retained metadata claims; inconsistent or invalid authority preserves bytes and intent. Known adopted objects remain. Pre-ready discard and quiescent writing cleanup stay in the object adapter; post-ready cancellation uses durable intent.

Legacy compensation readmits current source, consumers and receipt-scoped owners before rollback; ambiguity retains the receipt. Maintenance may refresh explicit recording/export or existing project-asset mirrors, but never infer private publication or flat-delete stale sources. Read paths perform no repair.

## Archive restoration

Restore is resumable per root, not globally atomic. Portable metadata is parsed before domain use; root publication and its archive checkpoint share one transaction. Existing replaced rows and external private-source consumers are admitted before mutation, with abort/drain on failure.

Published dependencies restore in order. Explicit `libraryMediaId`, borrowed bindings and private origins remap through committed root identities; shared bytes are compared in bounded chunks and readmitted in the consuming transaction. Equal content alone never establishes identity. Duplicate creates independent roots; skip preserves existing roots and requires usable dependencies. Legacy private/public defaults remain explicit.

Explicit replacement of a published root version preserves logical identity and frozen owners. Changing source kind or a domain source locator is refused; a `stored-asset` root may replace its immutable `source.assetId` under the same Library ID. Scenario resources freeze with `galleryAssetId` before replacement, retaining their old bytes and logical origin. Legacy canonical export also records that frozen relation. Scenario restore distinguishes those snapshots from canonical publication collision checks; explicitly borrowed sharing retains strict source-byte admission. Project-private replacement separately protects external consumers.

Storage backends remain below this graph. A future WebDAV adapter needs remote identity, credential/account boundaries, conflict/availability policy and durable deletion/retry receipts; it must not own project links or issue deletes from UI/domain consumers. Current `AssetRef.location` supports OPFS only.

## Operation owners

| Supported path | Commit/policy owner |
| --- | --- |
| Image capture/import/editor save/copy | `index.screenshots`, `image-aggregates/mutations` |
| Private acquisition / independent output | `projects/asset-publication` |
| Recorder batch and completion outbox | `recordings/asset-publication` |
| Page Package publication | `web-snapshots/publication` |
| Scenario save/child replacement/history prune | `scenario/aggregate-mutations`, `retention` |
| Montage save/detach | `projects/index`, `asset-references` |
| Quick-edit current/history/recovery | `review-workspaces/store` |
| Editable document bindings | `document-assets/ownership`, inside parent transaction |
| Rename/tags/promote | Library/scenario/video metadata owners |
| Trash/restore | `library-lifecycle/trash` |
| Confirmed material purge | `media-library/delete-cascade`, `delete-cascade.sources` |
| Montage/scenario parent removal | `projects/index.delete`, `scenario/aggregate-cleanup` |
| Expiry/temporary cleanup | `library-lifecycle/cleanup`, same dependency/private-release rules |
| Lower recording/export/Web deletion | Source compatibility APIs, exact source and zero-consumer policy |
| Scenario HTML catalogue | `scenario/projects/exports`, `export-artifacts` |
| Archive material/project roots | v6 `root-publication`, domain backup participants |
| Archive skip/duplicate/shared restore | v6 orchestration/codecs/binding admission |
| Publication retry/cancellation | `assets/publication`, `recovery` |
| Physical replay | `assets/operations`, shared retention/claim admission |
| Orphan audit/legacy compensation | `asset-publication-recovery` |
| Legacy Library synchronization | `index.legacy-sync`, scenario backfill |

Configuration, derived caches, native transfer chunks and bootstrap/export-input handles have separate authorities. Full privacy reset intentionally bypasses selective preservation under its exclusive owner. Proof follows affected operations and real participants: success/refusal, late rollback, replay/stale admission, old/shared/frozen data, nested resources and physical retry where reachable. A mocked successful participant proves preparation only.
