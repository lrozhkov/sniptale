# Persistence contracts

Explicit media backup v6 writes `library-folders-v4` when the admitted inventory includes quick-edit project metadata. Readers retain layouts `library-folders-v1`, `library-folders-v2` and `library-folders-v3`. V4 uses the V3 shared-object profile and resource limits. Legacy layouts cannot carry project metadata.

Payload envelopes reference one declared JSON payload and bounded PNG objects for authored video-review and montage window-header favicons. Review history, including redo, and opaque legacy recovery keep their logical formats. Check JSON and favicon transport objects directly from ZIP.

Exclude them from OPFS staging, ready journals, retained asset IDs and Library publication.

Canonical root publishers retain their existing mutation and resource authority. This archive transport does not change database stores. Envelope/manifest/catalog JSON has a 4 MiB bound. Each expanded root has a 128 MiB bound, including repeated favicon hydration and JSON sidecars. Expanded archive metadata has a 512 MiB bound.

Depth remains 64 and the existing ZIP entry/byte profiles remain authoritative. Domain text bounds and the Scenario history owner bound remain independent. Out-of-profile exports refuse without truncating local history. Old clients refuse an unsupported layout at the manifest discriminator before restore.

V3 and V4 have an explicit bounded `sharedObjects` table with physical path, SHA256, size and MIME. Each shared reference preserves its root-local object ID and filename and names only a table row. A row must have one admitted direct root reference as its physical anchor and at least one shared consumer. Inspection admits each typed domain resource role, the exact physical inventory, and each shared reference separately. It hashes each shared entry once before staging.

Undeclared or unused rows, alias chains, missing anchors and conflicting size/MIME/digests refuse before mutation. Export hashes actual immutable bytes through one operation-local registry after payload encoding. Selected readable files remain even when equal, while internal copies may reuse their declared entry. JSON payloads and sidecars use ZIP compression. Expanded limits remain unchanged.

Restore retains root-local OPFS staging and existing per-root claims. Thus, failure of a later root cannot discard an already committed root's objects. This archive layout requires no database migration.

`sniptale-db` is the shared product database. Its physical IndexedDB version selects the migration path. Each `schema_contracts` row identifies the logical format required by one domain owner. The current physical version is in [generated project facts](../engineering/project-facts.md). Sniptale does not support `sniptale-video-db` versions 1–30.

`apps/extension/src/composition/persistence/infrastructure/indexed-db/schema-contracts.ts` owns store ownership and data classes. Durable stores survive every supported beta migration. Rebuildable stores may be discarded. Operational stores define restart or recovery behavior.

Keep one database because recording publication commits recording metadata, media, assets, and the completion outbox atomically.

## Recording recovery

The recordings domain owns `recording_recovery_sessions` and `recording_recovery_blocks` in the canonical database. Both stores contain authoritative user data. Database version 33 adds these stores and changes the recordings contract from 2 to 3. The migration preserves all earlier rows and immutable media.

Each session has an identity and an incarnation. Ordered immutable blocks contain the encoded media bytes. A strict-durability transaction commits each block and its acknowledged session boundary together. Acknowledgement follows transaction completion.

IndexedDB strict durability requests a disk flush before completion. This guarantee assumes that the operating system and hardware honor durability requests. Frames in the encoder and pending blocks in memory remain vulnerable to termination or power loss.

A random epoch header in the sessions store fences delayed opening operations across local-data erasure. Only initialization creates this header. Opening captures the epoch before waiting for an identity lock and checks it again before writing. An absent or changed epoch refuses the old operation. An absent or changed incarnation refuses a delayed append.

Database admission completes before an identity lock. Code must not hold a mutation permit while waiting for this lock. A live cross-context lock distinguishes an active writer from an interrupted writer.

Failure stops affected producers and retains committed blocks. Finalization, publication, recovery, and download failures do not delete these blocks. Successful publication also retains the original safety copy. The original session receives its `published` flag inside the same transaction as canonical publication. Encoded output completion alone does not establish a saved Library recording.

Saved blocks are internal protection for the canonical recording. Gallery displays no separate safety-copy row or cleanup action when either published target has a readable canonical file. If both targets become unavailable, Gallery exposes the retained source for recovery. Discovery does not write or delete data.

Automatic expiry, Trash cleanup, and orphan cleanup cannot delete an unreferenced safety copy. Explicit discard, admitted canonical deletion, and complete local-data erasure can delete recovery data. Canonical deletion must first admit all source dependencies. Refused deletion retains the safety copy.

Recovery uses a stable separate target identity and refuses replacement of an existing target. Playable-prefix recovery preserves every original block, including an incomplete suffix. Raw download retains the original bytes and order. A failed recovery leaves the source available for retry or raw download. Readers do not substitute original bytes into an unrelated canonical asset.

Explicit media backup v6 excludes pending recordings and retained safety copies. Recovery UI exports interrupted sources. Ordinary Library download exports successfully saved videos. Do not classify these stores as temporary staging or rebuildable caches. Do not admit a destructive migration of recovery data until the backup contract covers the complete recovery inventory. Verified local-data erasure deletes both stores, including the epoch header. This feature requires no extension permission changes.

## Admission and migration

Quick-edit projects can share one source video. The source media ID identifies its default workspace. An archived workspace retains its own aggregate ID and an explicit `sourceMediaId`. Source lookup, usage, retention, authorization, and transfer resolve that reference. History and draft writes retain the workspace aggregate ID.

Creating a project copies the complete previous default into an independent archive. One transaction creates the archive and replaces the default. The default revision increases, so delayed writes cannot replace the new project. A stable archive ID identifies a repeated command. Failure preserves the previous default.

Database version 36 changes the mediaLibrary contract to 28. The migration preserves existing rows, history, recovery, stores, and indexes. Earlier writers cannot admit this database. Portable backup gives each archived project an independent media root. Restore binds that project to its restored source.

Quick-edit logical formats 3 and 4 require project names and permanent lifecycles, including independent Trash admission times. Format 3 uses the legacy advanced baseline. Format 4 retains the complete document baseline. Physical formats 4 and 5 store these logical formats.

Formats 1 and 2 remain readable without project metadata. Their physical formats remain 2 and 3. Reading does not materialize project metadata.

Project metadata stays outside content Undo/Redo history. Content saves preserve metadata from the currently admitted workspace, including buffered saves. Canonical workspace writers and portable restore preserve it. Admission rejects missing or invalid metadata and mixed logical/physical envelopes. Additive admission preserves existing heads, operations, recovery and source bytes. The [generated project facts](../engineering/project-facts.md) identify the current database version. Earlier writers cannot admit this database. The archive layout provides a separate admission fence.

Document autosave adapters in Gallery, Scenario, Montage and standalone Image consume the data-only `features/autosave/policy.ts`: 1000 ms idle delay and 5000 ms maximum pending age. These are request deadlines while the page runtime is available. An acquired write, suspension, conflict or browser termination can delay or prevent completion. Timer publication does not seal an Undo action. Existing document owners retain serialized writes, latest-version acknowledgements, CAS and explicit save/discard authority.

Hidden/pagehide requests are advisory. Beforeunload guards dirty state and never disposes the writer. Pageshow and visibility restoration recheck the live generation.

Montage controlled transitions lease the mounted writer's latest barrier through the existing save-readiness owner and synchronously ingest its current controller-store project before waiting. Image automatic capture and presentation remain closed during document hydration. Only the current opening lease can perform the initial explicit save. Ordinary rename/promotion saves refuse while loading. A page-local hydration epoch also refuses queued explicit captures from a previous load of the same aggregate.

Embedded Image retains Scenario as the sole durable Apply owner.

Ordinary Gallery append still reads and admits the complete native head, baseline, current and redo history, source identity and resource closure in its existing transaction. Physical format3 and format5 appends reuse unchanged canonical values only from that fresh private read. They check the new operation and changed fields. They encode only rows actually written. Legacy conversion and explicit replacements keep full candidate admission.

After transaction completion, the default session adapter receives an explicit transient document projection from the same successful mutation. Thus, its ACK does not replay retained history again. Plain read/commit snapshots keep their existing shape. Injected adapters without that capability retain strict replay. The implementation uses no cross-read trusted cache or stored validation flag.

Gallery's public dirty projection includes uncaptured authored content and note recovery until the matching producer ACK. Registration identity survives cancellation/reload boundaries. An older ACK or an ACK that stages the next group cannot clear its replacement. Failed reload retains the warning until a successful confirmed discard. UI-only preferences remain outside this additional authored warning.

Internal document-buffer dirty state continues to select existing persistence paths.

Run readiness under the exclusive persistent-data transition barrier before admitting ordinary mutations. Readiness checks the database version, stores, indexes, and domain contracts. Return a typed recovery result when admission fails. Gallery owns interactive recovery. Cold admission does not scan existing media or workspace provenance.

Parsers sanitize legacy provenance on read, and Gallery schedules cancellable rewriting after rendering. Discovery holds no mutation permit. Each current-row rewrite acquires its own permit and preserves newer data.

Retain a browser fixture and a contiguous migration descriptor for every released beta source version. Each descriptor identifies source and target versions, changed domains and stores, risk, backup coverage, and required free-space estimation. Refuse missing paths, future versions, malformed contracts, unknown required space, or insufficient quota before opening the target version.

Run lossless IndexedDB changes in one versionchange transaction. Publish domain versions only after validation. Migration descriptors must enqueue work synchronously and return `undefined`. Use transaction abort for interruption recovery. Keep OPFS source objects until a restartable journal records the new graph as durable.

Refuse destructive durable-data migration without complete source-version backup coverage.

Gallery voiceover transcripts and accepted generated-phrase references require physical version 5 and the mediaLibrary logical contract 4. The additive 4→5 migration retains existing workspace rows, history, recovery drafts, asset references and OPFS objects without rewriting them. Speech admission introduced advanced version 4 while retaining legacy versions 2 and 3. Generated references participate in the review owner's history, backup and deletion graph. Earlier application versions refuse the newer database before ordinary mutations, preventing legacy parsers from discarding speech references.

Gallery scene watermarks require physical version 6 and the mediaLibrary logical contract 5. The additive 5→6 admission step preserves workspace rows, history, recovery drafts, asset references and immutable objects without rewriting them or enabling watermarks in existing projects. Advanced content parsers retain legacy versions 2–4 and emit version 5. Remembered logo references participate in the same review history, backup and deletion graph as active logos. Earlier applications refuse the newer database before ordinary mutations, preventing older parsers from silently discarding the new content and asset references.

Gallery presentation join settings require physical version 10 and mediaLibrary contract 9. The additive 9→10 step retains every workspace, history, recovery draft, asset and native usage index. Advanced version 8 admits versions 2–7 without injecting join defaults into legacy settings or replay operations. Earlier applications refuse the newer database before ordinary mutations.

Gallery window zoom modes require physical version 13 and mediaLibrary contract 12. Advanced version 11 adds explicit whole-window and fixed-frame zoom over a stationary background. The header always transforms with the video. Existing fixed/follow-video and absent settings retain their legacy rendering. The additive 12→13 admission step leaves workspace rows, history, recovery drafts and immutable media untouched.

Only newly created workspaces start in whole-window mode. Explicit author edits select either new mode through ordinary history.

Gallery incremental history uses physical database version 18 and mediaLibrary contract 17. The additive admission step creates only the empty durable `video_workspace_history` store and its aggregate index. Existing workspace, media and OPFS objects remain unchanged. Private physical format 2 stores a compact source/revision/cursor/reference head, advanced baseline at ordinal zero and immutable operation rows. Session and portable review format 1 remain unchanged.

Readers materialize full retained history within the caller's head/history transaction before canonical logical admission. Refuse missing, future or incomplete physical evidence without fixes on read or deletion.

After admission, ordinary append writes one head and one operation. Cursor movement writes only the head, and branching removes only the retained redo suffix. Complete before/candidate/redo admission, CAS, recovery draft consumption, source promotion and derived reference keys remain atomic under the original mutation owner. Explicit restore, detach, baseline replacement, paused-buffer replacement and the first fully admitted legacy mutation may replace all owned history rows. Indexed usage materializes only matching heads and their rows in one readonly snapshot.

Index maintenance preserves the physical representation. Parent deletion and local-data erasure include baseline, operation and orphan evidence. Earlier builds refuse the newer database rather than downgrading it.

Scenario content uses physical database version 20 and scenarioProjects contract 6. The additive 18→19 step creates the empty durable `scenario_project_history` store with `[projectId, revision]` keys. 19→20 adds only the empty `scenario_project_units` store with `[projectId, unitId, revision]` keys. Both have a project index. Released roots, history and immutable objects remain unchanged on admission.

Private head format 2 retains current root settings and ordered Guide item/Tour slide references. Historical rows retain their original project settings, owner revision and saved time with the same unit representation. Versions share unchanged content units. Unit row revisions are private scoped identities, never aggregate CAS revisions. Logical ScenarioProjectEntry, editor snapshots and portable backup v6 remain unchanged.

The original fifty-version and 64 MiB logical metadata limits still apply.

All readers materialize head/history/units from one caller-owned native snapshot before canonical admission. Reads never convert, fix or discard evidence. Missing, extra, future, malformed, unreferenced and orphan rows refuse mutation. Orphan child cleanup checks scoped history and units even when the head is absent. An ordinary metadata save writes compact current/historical projections without content-unit writes.

Changing one Guide item or Tour slide writes only that unit. Retained rows remain byte-identical. Explicit history cleanup, replacement and confirmed parent deletion use their original transaction. They remove only admitted owned rows and units with no references from current or retained versions. A first admitted legacy or format1 mutation may baseline all valid retained versions atomically.

CAS, child ownership, publication journals, abort/drain and commit before physical deletion stay with the existing aggregate owner. Original logical-store callers retain opaque root metadata they explicitly preserve. Privacy erasure includes historical and unit orphan rows. Full canonical history preparation remains separate optimization work.

Logical history byte measurement retains the exact UTF8 size of the complete canonical saved-version JSON. It measures the version/root/settings wrapper with empty body arrays, then adds Guide item and Tour slide JSON bytes and array commas. Identical canonical JSON strings reuse their encoded length only within that synchronous admission or append call. Admission serializes every changed value again. Each value receives its own measurement.

The operation persists no size metadata. No mutable object identity substitutes for validation. The temporary map does not survive the operation. Canonical parsing, the 64 MiB and fifty-version limits, and detached history snapshots remain unchanged.

Private aggregate entry preparation may retain history values from its own freshly canonicalized storage snapshot instead of cloning that detached graph again. Both ordinary transaction and publication-target preparation privately admit the snapshot before opting into exclusive history ownership. Neither exposes or mutates those prior projects. The returned current project comes from a separately canonicalized candidate. Native storage clones committed values.

General append/entry callers keep borrowed ownership and full history detachment by default. This copy choice does not change canonical admission, retention, revision or transaction authority.

Gallery Effect V1 annotations require physical database version 21, mediaLibrary contract 18 and advanced schema 15. The metadata-only20→21 admission preserves workspace heads, baseline/operation rows, drafts, project assets and immutable media without rewriting them. Optional annotation instances retain source-time placements, controls, canonical geometry and snapshot identities. Legacy omission remains absent. The workspace owns the immutable source/resource registry outside history payloads, physically alongside the advanced baseline at ordinal zero.

Cursor writes remain head-only. Adding a snapshot updates that baseline and the new operation in the original transaction. Earlier writers refuse the newer database before dropping annotation content or resource references. Check source digests and resource bytes outside IndexedDB transactions. Structural descriptors alone do not authorize publication or adoption.

Gallery PCM speech profiles require physical database version 22, mediaLibrary contract 19 and advanced schema 16. The additive 21→22 admission changes only the domain contract: current workspace heads, baseline/operation rows, recovery drafts, accepted MP3/WAV assets and immutable objects remain unchanged. Legacy advanced schemas through 15 remain admitted, including Effect V1 annotations. The selected wire format `pcm` remains in authored profiles and request signatures. The receiving background adapter accepts only S16LE/24 kHz/mono and stages ordinary WAV with unchanged samples.

Earlier writers refuse the newer database before dropping unsupported profiles or asset references.

Gallery bundled action sounds require physical database version 23, mediaLibrary contract 20 and advanced schema 17. The additive22→23 admission publishes only the domain contract, retaining released workspace heads, baseline/history/recovery, private assets and immutable bytes. Optional typed action/signal settings remain absent in legacy projects and own no Library or OPFS bytes. The installed application provides versioned bundled sample IDs and generator policy as resources. Accepted voiceover and music references retain their existing authority.

Earlier writers refuse the newer database before dropping the authored settings.

Bounded editor history requires physical database version24, mediaLibrary contract21 and scenarioProjects contract7. The additive23→24 admission publishes contracts only, preserving every released head, row, draft and immutable object. Ordinary admitted mutations retain at most50 combined Undo/Redo transitions and8MiB canonical UTF8 operation metadata. Current content remains outside that budget. Gallery logical format2 retains a complete document baseline, including Cuts, Speed, notes, canvas comments and authored advanced content.

Physical format3 keeps that baseline at ordinal zero and a stable positive ordinal range in the head. Reads check the full retained graph and redo without mutation. The first admitted legacy mutation may replace its representation. Warm rollover removes only expired rows and updates baseline/head and the new tail, including ordinary paused-buffer Save.

Gallery field typing uses an explicit owner API with a page-issued action identity, exact field target and immutable write identity under fresh source/CAS admission. Only that active group may replace its own tail, retaining its first identity, time and before value. A bounded head marker acknowledges only the latest capture. Other authored commands and cursor changes close it. An oversized whole group folds into current baseline and remains baseline-only until a new field intent, even if later text is smaller.

Missing or superseded write evidence is unknown and cannot authorize another append. UI-only acknowledgement, idle and maxWait do not close the field group. Portable review carries authored history and the complete baseline, omits this private write marker and rejects marker-bearing input before restore publication.

Scenario saved versions retain at most20 previous roots and16MiB canonical UTF8 metadata, separately from current content and the50/8MiB page Undo policy. Existing valid50/64MiB roots remain read-admitted until an explicit mutation. The existing editor/autosave queue publishes final closed action captures in order before a later action. Repeated publication of one action retains its earliest previous saved root. Generate action IDs outside the pure reducer.

These IDs require an exact owner revision for metadata-only publication.

Other accepted content writers and explicit restore close the marker. Earlier application versions refuse physical24 before writing any new baseline or group fields.

Known-source Montage acquisitions require physical database version 26 and assetGraph contract 3. The additive25→26 admission retains released rows and immutable objects. A private child references an existing recording or project-export object through an exact ready source claim. Decoding stays outside the native transaction. Fresh publication checks the selected Library locator, source metadata and complete immutable ref in the destination transaction.

Before origin lifecycle admission, exact accepted replay checks the private row, body owner and ref. Thus, lost acknowledgement followed by origin Trash does not cancel an accepted child. Ambiguous evidence retains the receipt without fixes or overwrites to storage. Older writers refuse the newer database before ignoring this claim.

## Alpha reset and recovery

Use `sniptale-video-db` only in alpha-reset and privacy-erasure inventories. Under the persistent-data barrier, Gallery records a browser-storage journal, removes alpha IndexedDB and OPFS data plus preview cache, checks absence, and clears the journal. Resume an interrupted reset from that journal. Do not migrate or export alpha data.

Do not fix or reset on read. Gallery may offer retry for blocked or insufficient-space states and confirmed reset for corrupt or unsupported data. Never downgrade a future-version database. Reset preserves browser-storage preferences and removes IndexedDB, OPFS, and transition metadata.

## Change proof

For a database or domain version change, update the registry, retained source fixture, target fixture, and contiguous descriptor. Prove deterministic output, interruption and rerun, quota handling, backup or refusal, and affected runtime and UI behavior.

Accepted Image commits create or promote permanent Library roots in the workspace transaction. Category settings apply to incidental captures, not accepted Image projects. Quick-edit mutations retain the primary Library source and recording mirror in their original transaction. Failed admission, CAS or publication rolls back promotion.

Explicit quick-edit create or reopen materializes project metadata through the existing workspace owner. Read-only recovery does not materialize it. Existing project names and independent Trash markers survive content mutations. A new project on a trashed source requires explicit source restoration.

Archive publication retains accepted Image and quick-edit sources before temporary lifecycle rebasing. It preserves their source Trash markers. Accepted review resources also retain remapped Library origins, including resources outside the montage placement graph. Reused published sidecars retain their existing admission authority.

## Gallery trash

Trash is authoritative lifecycle metadata on the Library or project root. Moving or restoring a root retains its source class, aggregate, workspaces and immutable bytes. Browsing, counts, tags and facets exclude Trash. Raw enumeration and dependency resolution retain it. Restore clears the marker and restarts temporary retention timing.

Metadata edits and publication replay preserve the marker.

The lifecycle owner serializes move, restore and purge across runtimes. Confirmed purge rechecks the observed revision and active/Trash state under that lock. Active roots need no intermediate Trash mutation. A concurrent move or restore invalidates the confirmation. Empty Trash removes confirmed project roots before selected source media and revalidates outside dependencies.

By default, expiry is off. Storage settings select 1, 3, 7, 14, 30, 60, 90, 180 or 365 days after moving to Trash (initial choice 30). Gallery opening/refresh performs the enabled check. This does not imply a wakeup schedule. Referenced or ambiguous materials remain, and failures show retry feedback.

Temporary-draft cleanup excludes Trash at selection and mutation time.

Independent video exports keep their own lifecycle after parent removal. Scenario HTML catalogue records own optional `trashState`. Legacy records start active. Destination class may come from the source project, but its Trash marker does not. Catalogue purge removes only that record and thumbnail.

Parent removal retains its documented catalogue cascade. A confirmed batch parent deletion subsumes selected catalogue children. Privacy erasure removes all local data through its exclusive reset owner.

## Material identity and ownership

| Entity | Authority | Meaning |
| --- | --- | --- |
| Immutable object | `AssetRef.assetId`, `asset_refs`, object adapter | Byte identity.  OPFS location is storage metadata. |
| Byte owner | `asset_owners[ownerKind, ownerId, role]` | Explicit retention. Several owners may share one object. |
| Library material | `MediaLibraryEntry.id`, `media_library` | Visible identity, source locator and lifecycle. |
| Project resource | Scenario child ID or montage asset/source | Placement or frozen representation, distinct from a card. |
| Editing workspace | Media aggregate or scenario document ID | Current content, retained history and document-byte bindings. |
| Independent copy/export | Its own published identity | Separate lifecycle. Origin and filename are provenance. |

Project insertion preserves the source Library identity. Private `project_assets.originMediaId` records it before placement. Montage locators repeat it. Scenario imports use `borrowedMediaId` for shared original bytes or `galleryAssetId` for a private frozen representation. Canonical `scenario-asset:<childId>` membership is logical identity, independent of a replaced root's byte version.

Insertion/backfill does not publish another card. Explicit imports, copies and outputs may publish independent identities. Filenames, hashes and equal bytes never merge them. Existing independently published identities are not consolidated by content.

### Library sources

| `source.kind` | Durable source | Root byte owner |
| --- | --- | --- |
| `screenshot` | Inline Library blob, including imported image roots | Root row. Editable documents own additional objects. |
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
| Quick video edit | Voiceover/music/background/webcam assets in current, undo/redo, advanced and recovery state | Review reference collector/remover |
| Image/scenario document | Immutable document bindings | Document byte-ownership owner |

Guides/tours admit image and audio resources, not direct video, Web or HTML sources. Quick edit admits video roots and auxiliary audio/image assets plus an explicitly enabled webcam from the same recording group. Image editing admits image objects. Conversions yielding an image are separate image acquisitions with explicit provenance. Unsupported combinations remain unsupported.

## Dependencies and deletion

Explicit maintenance recovers accepted publication journals before project retention repair and expiry. Repair retains primary Image and quick-edit sources and recording mirrors. It materializes missing quick-edit project metadata through the existing workspace storage adapter. This admission advances the workspace revision once and preserves source identity, content history, recovery and Trash. Repeated repair preserves the admitted workspace. Missing source roots remain missing.

Expiry moves an unused temporary Library root to Trash at the actual admission time. It preserves source rows, sidecars, owners, references and bytes. It creates no physical-delete intent. The existing Trash and durable lifecycle locks serialize admission with restore and source mutation. The transaction checks fresh lifecycle values and authoritative project dependencies. Unknown review evidence and any retained primary workspace prevent expiry.

Disabled expiry still permits retention repair. It leaves active temporary materials unchanged. Restoring a temporary root starts a complete new retention window. Trash cleanup has its own opt-in policy and retention period. Gallery defers later destructive maintenance if retention maintenance fails. Background startup uses the same recovery, repair and expiry sequence.

Gallery’s informational project usage reads native IndexedDB indexes. These include `usageReferenceKeys` (multiEntry) on video projects and review workspaces, and `originMediaId` on private project assets. They also include `borrowedMediaId`/`galleryAssetId` on scenario children.

Derived document keys include current and retained history/recovery references and update in the same transaction as their owner document, including restore and detach. Imported keys are never authoritative. Lifecycle-only raw rewrites preserve them. Parsed rewrites recompute them.

Native indexes remove entries atomically on removal.

Version 9 adds the indexes without rewriting project documents during versionchange. Gallery cooperatively backfills legacy document keys after rendering in bounded key batches, acquiring a mutation permit only for each current-row rewrite. The marker `indexed:v1` and indexed counts identify incomplete coverage. The inspector reports unavailable until completion, never a false empty list. Selected-material queries read only matching identity aliases and documents.

This advisory index never authorizes deletion, retention or source release.

An accepted external source cannot remain temporary. Montage, scenario and quick-edit commits promote referenced Library origins and recording mirrors in the consuming transaction. This includes retained history/recovery references and admitted ready sources. Preparing or rejecting an attachment does not promote it. Opening a standalone editor sidecar alone does not constitute an external use.

Project documents and resource children own links. `media-library/dependencies.ts` derives the same identity projection for warnings, confirmed purge, automatic retention and private-source release. No cached counter or persisted reverse index authorizes deletion. Admit newly added locators against their source rows in the consuming transaction. This includes frozen scenario origins and quick-edit current, history and recovery references.

Quick-edit attachment before publication may use a matching standalone ready journal sampled under the existing lifecycle lock before the transaction.

That lock remains held through commit. Frozen origin admission does not require byte equality. Unchanged legacy missing locators do not block unrelated edits.

Confirmed purge locks and revalidates the graph, removes admitted non-primary uses and saved history, then removes source/sidecars/owners and records physical intent in one transaction. Primary recording uses block purge. A root's own workspace is part of that root, not an external consumer. Busy scenario sessions/readers refuse before writes. Acquire the resource gate once.

Order project locks deterministically. Fixed domain codes provide feedback without logging source content or record identifiers.

Unattended expiry and cancellation never detach adopted project state. Parent removal preserves independent outputs and externally used private resources. Scenario child replacement/prune/removal rehomes representations still used by montages before unlinking them. Manual purge and parent/archive cleanup recursively release private auxiliaries against the final graph, including nested review history. Published or external consumers remain.

Related invalid documents, missing sources and ambiguous locators retain data. Unrelated invalid presentation metadata may be skipped only when checked dependency locators prove disjointness. The version-2 montage envelope checks origin, base recording and every source independently of rendering metadata. Unsupported versions, legacy template markers and unknown/missing source slots do not prove disjointness.

## Publication and physical recovery

Publication intent is explicit. Source writers own ready journals, expected-source/revision admission and replay. Exact replay preserves user metadata, Trash and consumed completion events. Existing-root editor saves cannot recreate a purged root, including revision zero. New drafts create roots explicitly.

Ordinary immutable-source replacement protects external consumers.

Compound parent/child writes, byte ownership, sidecars, revisions and journal checkpoints commit together. A logical exception after a successful IndexedDB request must abort and drain the transaction. Physical I/O follows commit and cannot roll it back. Failed deletion retains durable intent for retry.

`assets/retention-authority.ts` provides the read-only source/document ownership projection shared by physical replay and orphan audit. Before I/O, the physical owner rechecks actual/projected owners, ready document/resource claims and unresolved rollback receipts under the lifecycle lock with an explicit reusable permit. Missing refs/owners do not remove retained metadata claims. Inconsistent or invalid authority preserves bytes and intent. Known adopted objects remain.

Pre-ready discard and quiescent writing cleanup stay in the object adapter. Post-ready cancellation uses durable intent.

Legacy compensation readmits current source, consumers and receipt-scoped owners before rollback. Ambiguity retains the receipt. Maintenance may refresh explicit recording/export or existing project-asset mirrors, but never infer private publication or use flat deletion for stale sources. Read paths perform no fix.

Private Scenario aggregate mutation reads admit historical Guide units once in a synchronous batch. The freshly materialized storage graph stays private and stable during that call. Each root, document-wide bounds, identifier rules, revision order and exact fifty-version/64 MiB retention budget remains checked. Canonical historical items and their byte lengths may be reused within that owned call, with no cache across reads, persisted validation marker or schema change. Current editable projects and general borrowed read/archive/retention callers retain detached parsing.

Tour admission keeps its canonical document and navigation checks. Mutation owners never expose or change the shared historical graph.

## Archive restoration

Restore is resumable per root, not globally atomic. Parse portable metadata before domain use. Root publication and its archive checkpoint share one transaction. Before mutation, admit existing replaced rows and external private-source consumers. Abort/drain on failure.

Published dependencies restore in order. Explicit `libraryMediaId`, borrowed bindings and private origins remap through committed root identities. Compare shared bytes in bounded chunks. Readmit them in the consuming transaction. Equal content alone never establishes identity.

Duplicate creates independent roots.

Skip preserves existing roots and requires usable dependencies. Legacy private/public defaults remain explicit.

Explicit replacement of a published root version preserves logical identity and frozen owners. Refuse changes to source kind or a domain source locator. A `stored-asset` root may replace its immutable `source.assetId` under the same Library ID. Scenario resources freeze with `galleryAssetId` before replacement, retaining their old bytes and logical origin. Legacy canonical export also records that frozen relation.

Scenario restore distinguishes those snapshots from canonical publication collision checks. Explicitly borrowed sharing retains strict source-byte admission. Project-private replacement separately protects external consumers.

Storage backends remain below this graph. A future WebDAV adapter needs remote identity, credential/account boundaries, conflict/availability policy and durable deletion/retry receipts. It must not own project links or issue removal requests from UI/domain consumers. Current `AssetRef.location` supports OPFS only.

## Operation owners

The active scenario editor keeps a `ScenarioProjectSnapshot`: the committed project and owner-issued `workspaceRevision` returned together. Loading, creation, copying, autosave and Guide/Tour resource application propagate that pair. Ordinary autosave and resource commands use the captured revision for admission. A late result cannot update another document generation. Manual latest readiness still returns the committed logical project after checking the versioned saved authority.

Metadata and project-step compatibility callers retain their timestamp predicate and unwrap the committed project explicitly. No caller infers a durable revision from timestamps or a local increment.

Publishing an ordinary scenario autosave into its current disposable buffer retains unchanged Guide item references when their serialized contents match the canonical result. Canonical metadata, changed items and item ordering still win. A newer local edit keeps the existing late-acknowledgement policy. Manual Save and unload protection compare logical content when the buffer and canonical snapshot have different references. This projection does not change the canonical saved snapshot, revision admission, persisted history or resource authority.

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
| Expiry/temporary cleanup | `library-lifecycle/cleanup`, Trash admission without byte release |
| Lower recording/export/Web deletion | Source compatibility APIs, exact source and zero-consumer policy |
| Scenario HTML catalogue | `scenario/projects/exports`, `export-artifacts` |
| Archive material/project roots | v6 `root-publication`, domain backup participants |
| Archive skip/duplicate/shared restore | v6 orchestration/codecs/binding admission |
| Publication retry/cancellation | `assets/publication`, `recovery` |
| Physical replay | `assets/operations`, shared retention/claim admission |
| Orphan audit/legacy compensation | `asset-publication-recovery` |
| Legacy Library synchronization | `index.legacy-sync`, scenario backfill |

Configuration, derived caches, native transfer chunks and bootstrap/export-input handles have separate authorities. Full privacy reset intentionally bypasses selective preservation under its exclusive owner. Proof follows affected operations and real participants: success/refusal, late rollback, replay/stale admission, old/shared/frozen data, nested resources and physical retry where reachable. A mocked successful participant proves preparation only.

Quick-review presentation settings retain each intro/outro image and video variant independently, including when the selected mode is None. Current content, history and recovery own those project-asset references. Portable backup remaps both variants. New workspaces author the initial fade defaults once, while legacy omission remains neutral. Scene publication claims bind the aggregate, exact slot, remembered media kind and acquisition kind.

Watermark and audio claims retain their existing restrictions. Library scene bindings revalidate the selected immutable source under the durable lifecycle owner and share its object reference without publishing another catalogue item. Admission accepts advanced schema6 with mediaLibrary6 and database7. Released database fixtures remain immutable.

Quick-review original speech requires physical database8 and mediaLibrary7. The additive7→8 admission preserves all released rows and immutable media without rewriting them. Advanced schema7 stores optional `audio.originalSpeech`. Legacy omission remains absent. Accepted replacements own generated assets and native intervals independently from editable draft phrases.

Derived Revoice clips and automatic original attenuation are never stored as another collection. Current content, history and recovery retain disabled or wholly cut replacements. Portable restore remaps them, and confirmed asset purge strips them together.

Automatic Gallery orphan cleanup starts from object IDs without reference keys, excluding writing and ready-journal claims. Candidate IDs confer no deletion authority. The physical-deletion owner holds the lifecycle lock continuously and the candidate object locks. Under those locks, it checks the complete current retention graph once per batch. It then records durable intent before touching bytes.

Recovery batches pending intents for physical deletion from its initial enumeration. It uses one lifecycle hold and one fresh snapshot, before restore compensation or publication changes the graph. ID-only OPFS enumeration first settles already-absent targets without scanning documents. Enumeration failure retains the intents. Remove each remaining intent only after its own physical work succeeds.

A failure preserves that intent and unprocessed intents for replay. Single-intent callers use the same deletion owner. Do not reuse a snapshot across compensation or publication mutations. Invalid metadata, rollback claims and newly adopted resources remain protected. Validation yields between groups of eight domain rows and retains only ownership projections, releasing parsed canvases/manifests instead of accumulating all documents.

Cancellation before intent prevents publication. Committed intent survives cancellation or IO failure for replay.

Gallery's user-visible maintenance journal observes phase outcomes and physical retention decisions through the existing owners. It is an advisory bounded browser-storage history, independent of `asset_operations` recovery authority. Opening/filtering it never enumerates Library documents or OPFS objects. The dialog subscribes only while open, uses storage events instead of polling and offers explicit filtered JSONL download. Logging failure does not change mutation outcomes.

Fixed reasons distinguish adopted/projected ownership, invalid authority, inconsistent refs/owners, rollback, pending publication, busy locks, already-absent targets and I/O failures. Recorded deletion counts follow completed physical calls.

Quick-review independent beginning/ending controls use advanced schema9, mediaLibrary10 and physical database11. Optional introControl/outroControl own mode and remembered plain/media fades. Legacy shared color/audio and fade fields are fallback only when the corresponding control is absent. Runtime projection does not rewrite persisted history. Asset references remain in the existing retained image/video slots, including when a control disables the side.

The additive 10→11 admission changes no source rows or media bytes.

## Advisory event history

`composition/persistence/diagnostics/event-history.ts` owns the independent diagnostic history described in [platform tradeoffs](platform-patterns-and-tradeoffs.md#event-history). Under one cross-context lock, append stores only the new sanitized JSONL chunk plus small active metadata. It reads the active payload and archive catalog only for size/day rotation or explicit export. The active segment is at most 1 MiB. Compression precedes one atomic transaction publishing the ZIP and replacing active chunks.

A failed transaction leaves the previous segment intact. The runtime or maintenance journal acquires a nonqueued mutation permit before queueing. It holds the permit through archive publication and recent-view updates. There is no idle maintenance timer or product database admission. Recent views may lag or lose events on advisory failure.

Archive export uses its own committed snapshot and never fixes storage on read.

Quick-review scene appearance uses advanced schema10, mediaLibrary11 and physical database12. Optional background rememberedPaint/rememberedLayout preserve the chosen fill and geometry while disabled or using an image. Assets remain in the existing image reference slots. Optional watermark text strike preserves legacy omission. The additive11→12 admission publishes only the domain contract: workspace rows, history, recovery, immutable bytes and ownership remain unchanged.

Older versions refuse the newer database before writing settings they cannot preserve.

Quick-review independent text uses advanced schema12, mediaLibrary13 and physical database14. Optional text, scene captions and ordinary voiceover text snapshots survive current content, history and recovery. Fragments own no audio bytes. The additive13→14 admission changes only the domain contract and preserves existing rows and immutable media. Existing projects without these fields open without a text document.

Earlier writers refuse the newer database before silently dropping authored text or clip snapshots.

Quick-review source attenuation uses advanced schema13, mediaLibrary14 and physical database15. Optional original.mutes contains take identities or detached source intervals. Derive linked coverage from ordinary voiceover geometry. Manual source gain and immutable media remain unchanged. The additive14→15 admission writes only the domain contract, retaining workspace rows, history, recovery and asset references.

Earlier writers refuse the newer database before dropping source mute bindings.

Quick-review AI text proposals use advanced schema14, mediaLibrary15 and physical database16. Optional fragment.origins records bounded descriptive provenance for explicitly restructured text from multiple sources. It owns no asset bytes or lease. Single-origin records remain admitted. All origin words count toward the existing document40000-word limit.

The additive15→16 admission changes only the domain contract, preserving workspace rows, history, recovery and immutable media. Replace and hidden-variant Apply use one existing advanced-content history operation, retaining ordinary voice takes, immutable text snapshots and source-mute bindings. Receipt acknowledgement reads canonical history before joining or saving newer buffers.

Quick-review source master gain edits use the compact `sourceAudio` history operation with only muted/volume before and after. Manual gain ranges, source mute bindings and other content remain in the replayed document. Compound edits retain full advanced-content operations. Existing histories are not rewritten on read. MediaLibrary16 and physical database17 admit this operation through a metadata-only16→17 step without scanning or rewriting workspaces or immutable media.

Earlier applications refuse the newer database before mutation. Alpha data migration is not required. Supported existing projects open through ordinary read-only admission, and invalid or future storage receives the existing recovery refusal without deletion.

After complete previous and candidate history admission, successful review-owner writes also re-encode legacy gain-only advanced-content steps as `sourceAudio`. Each step retains its identity, timestamp, order and cursor/redo meaning. Compound content snapshots remain full. Baseline, retained history and recovery keep the same reference graph. Reads do not change stored rows, and a failed transaction leaves the original legacy history intact.

This uses the existing database17 contract without mandatory migration or a second storage authority.

Private source retirement requires physical database25 and assetGraph contract2. The additive24→25 step changes only the journal contract, preserving existing authority and immutable objects. Quick-review history compaction and ordinary Montage placement removal atomically enqueue exact old-minus-new `{projectAssetId, expectedAssetId}` candidates in the existing outbox for physical deletion. They do not scan Library or remove source rows during autosave.

The existing lifecycle deletion owner acquires the available exclusive resource-reader gate before fresh source admission. Before logical release, the lifecycle deletion owner checks the complete authority. This includes exact source binding, private body ownership, immutable reference metadata, independent Library cards and own image/review sidecars. It also includes complete video/scenario/review dependencies, pending export inputs, publication and rollback claims. Source row, exact owner/reference release and the updated physical intent commit together.

Other byte owners survive. Physical authority is then reread before object deletion. IO failure preserves the intent. Busy readers and ambiguous authority retain logical candidates, including logical-only intents with no physical objects, for existing advisory startup replay. A changed binding ends only that old causal candidate and never removes its replacement.

Privacy erasure retains its separate cancellation/drain authority.

Recorded interaction authoring uses the current database and logical domain versions in [generated project facts](../engineering/project-facts.md). Its additive admission in [the migration registry](../../apps/extension/src/composition/persistence/infrastructure/indexed-db/database-migrations.ts) changes domain contracts only and preserves source telemetry, media, document/history/recovery rows and immutable bytes. Optional bounded anonymous keyboard rhythm, pointer observation/gesture metadata, authored focus paths and action feedback settings roundtrip through their existing owners. Quick review admits these fields through its [advanced schema owner](../../apps/extension/src/features/video/review/advanced/validation.ts). Earlier applications refuse the newer database before silently dropping these fields.

Reading older supported documents does not write or invent missing captured events.

Standalone interaction authoring uses project JSON version3 only when cursorFocusPath or actionFeedback is present. Supported version2 projects remain admitted without a read-time rewrite. The portable project discriminator makes older duplicate-import writers refuse these authored branches before publication, independently of their database version. Duplicate restore remaps both focus-path binding and action-feedback recording IDs through the existing exact reference owner, preserving instance identity, source times and immutable source facts. Ordinary source-timing mutations retain version3 even after removal of optional authoring fields.


Quick-review source cropping uses optional `canvas.crop` in the advanced content schema. The rectangle uses original source coordinates, normalized to the unit square. The additive database admission changes domain contracts only. It preserves existing workspace heads, history, recovery drafts, telemetry, and immutable media. Earlier applications refuse the newer database before writes. See [generated project facts](../engineering/project-facts.md) and the [migration registry](../../apps/extension/src/composition/persistence/infrastructure/indexed-db/database-migrations.ts) for current versions.

Crop edits use the existing content operation and workspace queue. Revision and source identity checks also apply to these edits. A failed save retains the local draft and the last saved document. Reading an older project does not create a crop or write a normalized document.

Gallery workspace colors belong to project UI settings, outside content history and export. Optional `ui.workspaceColors` stores independent light and dark values. Missing values use the resolved theme token without a default write. Advanced schema22, mediaLibrary26 and database31 prevent older writers from dropping the map. The additive migration preserves existing rows and immutable media. The existing UI autosave queue owns changes and retry.

Gallery track controls use advanced schema23, mediaLibrary27 and database32. The additive migration preserves existing rows and immutable media. Optional UI gates separate original audio, voiceover, music and text. Legacy voiceover and music gates use the grouped audio value. Legacy lock flags remain admitted and retained, but no longer restrict Gallery editing. The editor exposes no lock command. The review session orders master control changes after accepted field captures. Notes, history commands and accepted receipt recovery retain their existing behavior. Master changes preserve instance settings and update legacy enable flags atomically. Undo, Redo and return to history start restore these gates with the history cursor in one candidate. Local and durable history use the same cursor transition. Legacy lock data remains outside history. Reload discards failed control requests and invalidates queued continuations.

## Tour image-window appearance

Tour Appearance owns the optional global `stage.windowHeader`. Every image slide uses this header. Optional `imagePlacement` retains the bitmap center and scale independently from timed cameras. Original source dimensions and normalized targets remain unchanged.

Database34 and scenarioProjects8 admit these fields through a metadata-only upgrade. The upgrade preserves current projects, saved history, media and editor documents. Earlier writers refuse the newer contract before mutation. Ordinary reads do not write missing defaults. The existing Scenario aggregate writer owns saves, revision refusal and recovery. Portable Scenario JSON retains header PNG data and source placement through the existing codec.

## Montage original audio

Montage stores original-audio attenuation in project JSON version 6. Each attenuation override belongs to one audio take. The take records a volume from 0 to 1 and exact project-local asset and source-instance targets. These targets do not acquire resource ownership or storage access. Unresolved targets remain inert.

Preview and export multiply this attenuation separately from the manual gain envelope. Overlapping overrides use their minimum volume. Each override follows the current result interval of its audio take. Hiding the owning audio track temporarily excludes its override. Showing the track restores the same binding. Individual take volume and mute settings do not remove the binding.

Splitting a target preserves its source-instance identity. Duplicating a linked group remaps targets in its copied takes. Duplicating only a take retains its explicit targets. Removing one override leaves other overrides and manual gains unchanged.

Content mutations promote the project to version 6 when an override is present. Later mutations retain version 6 after removal of the last override. Versions 2–5 remain readable when this field is absent. Older project readers refuse version 6 before publication. This change does not require a physical database migration.


## Montage audio track masters

Project JSON version 7 admits optional `audioVolume` from 0 to 2 on AUDIO tracks. Omission means 1. Versions 2–6 remain readable without this field. Older readers refuse version 7. Content mutations promote the project to version 7 when a track has this field. Later mutations retain version 7 after field or track removal.

Preview and export multiply the track master separately from clip gain, fades, transitions, and original attenuation. Master edits preserve authored clip fields. A zero master does not remove original attenuation bindings. Track visibility remains a separate gate. Independent EffectV1 audio retains its own gain.

The existing project mutation, history, and save owners control these edits. Opening a project does not write a default master. This change does not require a physical database migration.


## Audio fade authoring and export phase

Gallery and Montage share the audio fade limit and linear envelope geometry. Audio fields accept up to 60 seconds, bounded by clip duration. Visual fade commands retain their five-second limit. An AUDIO fade command changes only its selected clip. Visual commands retain their existing linked operation.

Gallery adapters preserve source-time phases. Montage adapters preserve result-time phases. Overlapping fades use the minimum of both ramps. Independent gain stages multiply manual envelopes, fades, original attenuation, and transitions.

The offscreen collector derives `audioFadePhase` for each renderable media clip. It replaces imported properties with canonical phase data. Partial exports retain authored fade durations and advance the phase offset. This field belongs only to the export plan. It adds no durable field or persistence writer.


## Montage media gain interpretation

Preview and export use the existing `getClipGainRange` rule for media clips. Each explicit absolute endpoint takes priority over legacy multiplier fields. An absent endpoint uses the legacy volume and envelope. The existing rule bounds each legacy factor and final endpoint from 0 to 2.

Export derives canonical endpoints in a temporary media plan before range cropping. The plan multiplies track volume once, separately from fades, original attenuation and transitions. Opening and direct export interpret admitted legacy projects consistently. Rendering does not rewrite the supplied project or its durable gain fields. EffectV1 audio plans retain their independent gain semantics.


## Camera reflection in Montage

Project JSON version 8 admits optional `cameraMirrored` on VIDEO clips. The value must be a boolean. Omission means false. Versions 2–7 remain readable without this field. Older readers refuse version 8. Mutations retain version 8 after removal of the field or clip. Opening does not write a default.

Only clips on CAMERA tracks apply reflection. Other VIDEO clips retain the setting without applying it. Reflection changes camera pixels inside the cropped window. It preserves source clocks, placement, masks, shadows and window decoration. Source-bound action positions follow reflected pixels. Their glyphs remain upright.

The existing camera command, project mutation, history and save owners control these edits. This change adds no resource writer or physical database migration.


### Media window shadow colors

Video-project schema 9 admits `shadowColor` on VIDEO and IMAGE clips. The field contains a bounded color that the foundation parser supports. Versions 2–8 refuse this field. Readers refuse future versions. Mutations retain schema 9 after removal. Opening does not write default colors.

Color belongs to each media window. It does not change source bytes, placement, source time, or EffectV1 settings. Zero intensity retains the color. Mode changes retain authored colors. A missing color uses the existing mode default. Track application copies the source color and removes a target color when the source uses the default. Existing mutation, history, save, and export owners retain authority.


### Camera circle windows

Video-project schema 10 admits the circle shape on VIDEO camera appearances. Versions 2–9 refuse this shape. Readers refuse future versions. Mutations retain schema 10 after removal. Opening does not write default appearances. Non-camera VIDEO clips retain dormant settings.

The visible circle fits inside the authored pixel frame. The original frame and source clock remain unchanged. Gallery and Montage use the same frame and shape parser. Camera drawing, shadows, crops, and action editing use this geometry. Action editing evaluates the current camera position before source projection. Crop and mirror apply before rotation and transition scaling. Existing history, save, resource, and export owners retain authority.


### Camera position crops

Video-project schema 11 admits an optional crop on VIDEO camera positions. Versions 2–10 refuse this field. Readers refuse future versions. Mutations retain schema 11 after removal. An absent crop inherits the clip crop. Opening does not write defaults.

Crop values follow source time and the existing position transition. Cuts and rates do not rewrite these anchors. Shape, roundness, reflection, and shadow remain clip settings. Position reset removes its crop override. Existing commands, history, save, and resource owners retain authority. Gallery and Montage share crop validation and interpolation arithmetic. Each editor retains its transition scheduling.


### Camera hidden intervals

Video-project schema 12 admits optional `cameraHiddenRanges` on VIDEO clips. Versions 2–11 refuse this field, including an empty list. Readers refuse future versions. Mutations retain schema 12 after removal. Opening does not write defaults.

Each clip retains at most 512 ordered intervals with unique IDs. Source times are finite seconds from 0 to 86400. The start is less than the end. Intervals can touch but cannot overlap. Visibility includes the start and excludes the end.

Only CAMERA tracks apply these intervals. Other VIDEO clips retain dormant intervals. Montage uses camera source time. Gallery uses main source time before its camera offset. Both editors share interval validation and membership. Conversion must adapt these clocks.

Hidden intervals preserve camera trajectories, crops, source bytes, and audio. The inspector continues to edit hidden cameras. Cuts, rates, movement, and duplication retain source anchors. Existing commands, history, save, resource, and export owners retain authority. This change adds no writer or physical database migration.


### Montage source crop

Video-project schema 13 admits optional `sourceCrop` on VIDEO and IMAGE clips. Versions 2–12 refuse this field. Readers refuse future versions. Mutations retain schema 13 after removal. Opening does not write defaults.

The crop uses normalized coordinates in the original source. Both editors share crop validation and inverse rectangle geometry. Each clip retains its own crop. Crop edits preserve clip placement, scene dimensions, source clocks, audio, and immutable media. Explicit fitting uses the cropped source dimensions. Applying visual settings to a track preserves each target crop.

Drawing and source-point projection use the same fitted geometry. Headers join the cropped media plane. Source points outside the crop do not project into the scene. Manual scene points remain independent. Recorded separate cursors retain their source points and easing. Camera containment uses the original source binding and exact eased interval bounds.

The existing command, history, save, and resource owners retain authority. Preview seeks do not reload the source. A preview failure preserves editable metadata. This change adds no persistence writer or physical database migration.

## Montage scene background variants

Montage project schema 14 admits optional `sceneBackground.remembered` and `imageFit` on an image background. Earlier schemas refuse these fields. Readers retain schemas 2–19 without these fields and refuse future versions.

The remembered object contains at most one solid, gradient and image variant. Variants cannot contain another remembered object. Gradient variants retain authored animation. Image variants retain their asset identity and optional fit mode. Missing `imageFit` retains legacy cover rendering without a write.

Background changes retain the outgoing variant through the existing project updater, history and save authority. The current project supplies remembered values when another edit uses stale UI data. Undo and redo restore complete snapshots. Later mutations retain schema 14 after field removal.

Dormant image assets remain in the project asset graph. Existing save, backup and deletion owners retain their bytes. Export admission checks active and dormant image references. Preview loads only the active image. Failed decoding retains the authored settings and existing fallback paint.

These settings apply to the project canvas. They do not resize clips, change source clocks or define source window layout. No database store, resource authority or asynchronous writer changes.

Source deletion with user approval removes matching active and remembered image references. It preserves other variants. Active image removal restores the remembered solid variant or uses the legacy fallback.

## Montage rounded media windows

Project schema 15 admits `windowCornerRadius` on VIDEO and IMAGE clips. The value is a finite number from zero through 4096 in logical project pixels. An absent value keeps the rectangular window. Older schemas refuse this field. Reset retains schema 15. Reading does not add defaults or change source data.

The radius applies to the visible decorated window, including its header. Rendering limits the radius to half the smaller window dimension. Source crop precedes fitting. Preview and export use the same mask. Source-point admission and continuous cursor containment use shared rounded-window geometry. Gallery retains its coordinate adapter and uses the same clearance calculation.

Camera tracks retain this field without applying it. Their camera appearance remains authoritative. Ordinary track style application copies or removes the radius while retaining each target source crop. Existing project mutation, history, save, revision and resource owners retain authority. This field adds no writer, queued operation, database store or physical migration.


## Montage scene background blur

Project schema 16 admits optional `sceneBackground.blur`. The value is finite and ranges from zero through 25 logical project pixels. Older schemas refuse the field. Readers accept schemas 2–19 without the field and refuse future versions. Reading adds no defaults. Reset and removal retain schema 16.

Blur applies to the complete gradient or image background after fitting and animation. Solid backgrounds retain the value without applying it. Kind changes, image replacement and source deletion preserve this common value. Remembered paint variants cannot contain blur. Clips, headers, shadows, actions and transitions retain their own rendering semantics.

The existing project updater applies scalar blur edits to the current background. Undo, redo and save use existing snapshots and revision authority. Invalid edits and repeated equal edits preserve project identity and history. This field adds no writer, queued operation, store or physical database migration.

Both editors use the same edge-padded Canvas filter. Montage converts project pixels to output pixels once. Its temporary raster limits each side to 2048 pixels and the filter radius to 128 pixels. Three exclusive surfaces require less than 64 MiB. The existing pool owns allocation and release. Failed filtering releases surfaces and fails only the affected rendering operation. Export publishes static cache entries only after successful drawing.

Static background rasters retain one exclusive pool lease for at most one second. Cache identity includes paint, output dimensions, blur scale and decoded image identity and size. Changes release the previous lease before allocation. Animated gradients bypass this cache. Expiry clears the image reference. Failed drawing does not publish a cache entry.

## Montage media padding and decorated fitting

Padding is an explicit framing command for one ordinary VIDEO or IMAGE clip. The existing transform owns its placement. The command adds no persisted padding field or schema version. It preserves source crop, header, opacity, timing, effects and other clips. Explicit fitting centers the window and resets rotation. Later placement remains free.

The inspector measures the decorated window after rotation. Its editable inset leaves at least one available canvas pixel. Impossible values fail without changing history. Unchanged rounded input preserves exact placement. Invalid, locked, missing-source and CAMERA edits retain the current project. Repeated equal commands add no history entry.

Ordinary fitting uses the cropped source and its header as one plane. Camera fitting keeps its existing adapter and dormant header behavior. Ordinary scale controls accept 1–300 percent. Camera scale controls retain 10–300 percent. Existing readers already admit these values. Fit percentage remains a preset hint beside freely editable transforms.

Gallery and Montage share the inset calculation. Gallery retains its enabled-background policy and extra-header output size. This command uses existing mutation, history and save owners. It adds no writer, resource owner or database migration.


## Montage motion blur phases

Project schema 17 admits optional `motionBlur` on a `MotionRegion`. The shared Gallery parser validates the `enter`, `exit` and `link` settings. Each setting contains a boolean `enabled` and a finite `strength` from zero through one. Unknown phase keys do not enter the admitted model. Earlier schemas refuse the field. Readers accept schemas 2–19 and refuse future versions.

Reading adds no defaults. Absent phase settings retain the legacy `motionBlurAmount` behavior. An explicit phase map overrides that scalar. A missing phase in an explicit map stays disabled. Disabled settings retain their strength. The first phase edit preserves the other legacy strengths.

Entrance and exit use the retained animation clock. An outgoing source region owns link blur, including edits through the selected connection. Connected entrance and exit phases do not blur. Explicit phases do not blur during a hold or an instantaneous transition. Exposure cannot sample a different camera across a hard boundary. Continuous source-bound split parts retain their shared exposure when their clocks and camera geometry agree.

The existing project updater merges scalar phase edits into its current region. Invalid, repeated, missing-target and locked edits preserve project identity and history. Undo, redo, save and portable restore retain authored settings. Clip duplication copies bound motion regions with independent identities and maps connections between copied regions. It removes connections to sources outside the copied selection. Unbound scene regions remain unchanged.

Mutation and clearing retain schema 17. This field adds no writer, queued operation, store or physical database migration. The existing save revision owner remains authoritative.


## Montage camera phase transitions

Project schema 18 admits optional `phaseTransitions` on a `MotionRegion`. The partial map contains `enter` and `exit` types. Valid types are `none`, `linear`, `ease-in-out`, `ease-out` and `instant`. Earlier schemas refuse the map. Readers accept schemas 2–19 and refuse future versions. Unknown map keys do not enter the model.

The existing `zoomInDuration` and `zoomOutDuration` fields remain authoritative. Reading adds no defaults. An absent phase retains its scalar easing curve and endpoint behavior. Explicit `ease-in-out` uses the Gallery smoothstep curve. Legacy scalar `EASE_IN_OUT` retains its two-piece cubic curve.

An explicit `none` consumes no transition time. An exit with this type holds the camera target until the region ends. `instant` remains a separate mode. Editing one phase reserves the other active duration. Two explicit phases fit their active durations proportionally into the retained animation interval. An explicit duration is finite and ranges from zero through 60 seconds.

New manual and automatic camera regions use explicit Gallery smooth defaults. The existing project mutation owner promotes these projects to schema 18. Factory calls without phase settings retain their legacy contract. Mutation and clearing retain schema 18.

The existing updater merges each scalar command into the current region. Invalid, equal, missing-target and locked edits preserve identity and history. Undo, redo, save and portable restore retain the settings. Source-bound split parts retain their animation clock. Clip duplication copies bound settings into independent region identities.

Connected regions retain their phase settings. Existing connection topology suppresses connected entrance and exit phases. Connection easing retains its existing owner. The shared transition math adds no writer, store, resource or physical database migration.


## Montage spatial camera settings

Project schema 19 admits optional `perspective`, `depthOfField` and `spatialReference` fields on a `MotionRegion`. Earlier schemas refuse these fields. Readers accept schemas 2–19 and refuse future versions. Reading adds no defaults. Mutations retain schema 19 after removal.

Both editors use the same perspective and depth parsers. Perspective angles X and Y range from −60 through 60 degrees. Angle Z ranges from −180 through 180 degrees. Perspective strength ranges from zero through one. Depth mode is `area` or `depth`. Depth position, width and strength range from zero through one. Softness ranges from 0.01 through one. Disabling a setting retains its values.

The reference rectangle uses normalized project-canvas coordinates. Omission means the whole canvas. Coordinates range from zero through one. Dimensions are positive and do not exceed one. Each far edge must not exceed one by more than 1e-9. This tolerance covers floating-point addition. Source binding retains its timing and lifecycle meaning. Clip placement does not move the reference.

The existing project updater merges spatial scalar commands into the current settings. Invalid, equal, missing-target and locked commands preserve project identity and history. Reset removes only the reference rectangle. Undo, redo, save, hydration and portable restore retain authored settings. Source split, rate changes and duplication retain the settings. Duplicate regions have independent identities.

Evaluated poses and GPU resources do not enter these fields. The change adds no store, writer or physical database migration.


## Montage bookend presets

Project schema 25 admits optional `bookendPresets`. Each intro and outro slot retains image and video variants independently of its active mode. Earlier schemas refuse this field. Readers refuse future schemas. Reading adds no defaults. Mutation and removal retain schema 25 or a later version.

Each variant references a project material by its exact `assetId`. The reference does not contain a private resource identity. Inactive variants retain their references. Material use counts protect all retained variants from unused cleanup. Confirmed source removal clears only matching variants. Copy and portable restore preserve settings and material identities. The existing restore owner remaps private source identities separately.

Both editors share media framing, image duration, video trim and audio settings. Each editor retains its source admission limits. Native trim uses source seconds and cannot exceed the accepted material duration. Explicit insertion refuses a range shorter than one project frame.

A preset edit changes the recipe for future insertions. It never rebuilds existing clips. Insertion creates ordinary media clips and an editable opaque shape behind them. The linked shape follows splitting, trimming and movement. A speed edit from a source clip also retimes linked shapes with identical bounds. All affected tracks retain their lock and neighbor constraints.

Recipe edits require the exact accepted project snapshot and an idle history owner. Invalid references, stale snapshots and history failures preserve the project and history. The existing mutation, history, save and revision owners retain authority. This field adds no writer, queue, store or physical database migration.

## Montage composition joins

Project schema 26 admits optional `compositionJoins` and transition settings in `bookendPresets`. Earlier schemas refuse these fields. Reading adds no defaults. Mutation never reduces the schema version.

A join descriptor references the start or end of one ordinary image or video clip. The project accepts at most 128 descriptors. Descriptor identities and clip-edge pairs must be unique. Hydration retains valid descriptor shapes with missing clips. Export admission refuses missing anchors.

Insertion records a boundary even when its transition is None. These boundaries limit adjacent composition regions. An intro boundary follows the trailing descendant after a split. An outro boundary follows the original leading clip. Movement, trim and rate changes follow the referenced edge. Deletion removes the exact anchor descriptor. Clip duplication does not copy its boundary. Project duplication preserves clip and descriptor identities.

The anchor edge selects the boundary time. Adjacent explicit boundaries, including None, and the project limits define each complete composition region. Splitting a clip preserves the region and transition window. The anchor clip length does not limit them.

A preset transition configures future insertions. Editing a preset never changes existing instances. Instance edits require the exact accepted project and an idle history owner. Invalid proposals, stale projects and history failures preserve the project and history. Accepted edits create one history step.

Dissolve samples two complete compositions around the boundary. Samples include all tracks, camera settings, effects, captions and watermark. Samples exclude recursive joins and outer fades. The renderer applies outer fades once after the mix. Color transitions cover the current complete frame. Joins never change montage duration or crossfade audio.

Native preview uses the project frame rate. Export and size estimation use the selected output frame rate. Fractional rates remain fractional. The Native cadence normalizes rates below one to one. Gallery retains its rational microsecond clock. An unavailable dissolve endpoint fails the affected render request without partial publication. Other timestamps remain available.

The shared canvas owner retains at most two immutable endpoint copies. Native adapters use independent paused media with borrowed source URLs. The existing job or preview scheduler owns cancellation and disposal. Cleanup releases samplers before it revokes borrowed URLs. No new source reader, writer, store or physical database migration exists.

Caption admission checks each held sample at its exact time, including samples outside the selected export range.

Selected-clip export removes whole-composition joins from a temporary subset. A complete selection retains the original project. Project and selected-range exports retain joins. None of these projections changes the accepted root. Hybrid MP4 uses complete composition rendering inside active join windows. Existing fast paths remain available outside those windows.

Both editors share controlled fields and transition settings. Each editor retains timing, resource admission, preview and history ownership. The removed on-video notes interface remains absent.


## Montage camera media clocks

Montage schema 32 admits optional `cameraTiming` on VIDEO clips. A camera placement retains this field after a move to another compatible video track. Earlier schemas refuse this field. Readers retain legacy camera behavior when the field is absent.

`offsetSeconds` ranges from -86400 through 86400. The clip source clock owns positions, hidden intervals, and edits. Media decoders subtract `offsetSeconds` from that clock. They skip timestamps outside `[0, mediaDuration)`. Missing coverage does not repeat an endpoint frame.

The `bounded` transition policy caps effective position transitions at the next position. Interpolation starts at the previous authored destination and crop. Stored transition durations remain unchanged. Legacy cameras retain continuous interruption.

Gallery conversion creates a linked camera placement for each retained source slice. It retains camera settings when no camera pixels overlap that slice. Disabled tracks retain their placements and immutable media references. Camera offsets do not change montage duration.

Preview, export, thumbnails, and crop previews use the media clock. Source text and camera controls use the authored clock. Unmuted camera audio uses only the covered media interval. Project audio scopes retain authored intervals. Recognition maps those intervals to media time for decoding. Recognized text retains authored time. Existing gain and fade phases retain their authored times.

The existing project mutation owner promotes edits that contain `cameraTiming` to schema 32. Existing history, resource admission, retention, and guarded publication owners retain authority. This field adds no writer, store, or physical database migration.


## Montage cursor source observations

Montage schema 33 admits optional `cursorTrack.sourceObservations`. Earlier schemas refuse this field. Each group names one recording and one live video source instance. Its samples retain native source time, normalized recording points, capture segments, observation clocks, and observation gaps.

Raw recording observations follow the existing recording admission policy. The group collection and manual timeline samples retain the existing project item limits. Complete source observations can exceed the manual sample limit. Admission bounds projected samples by the retained source count and the number of owning clips. Missing instances, conflicting assets, invalid source times, duplicate identities, and malformed observation fields refuse admission.

The existing cursor owner materializes ordinary project-time samples for each retained clip. It interpolates cut boundaries from the full source observations. Trim, rate, move, split, and hydration repeat this projection without deleting source facts. Stable sample identities retain explicit Native appearance and interpolation edits. Duplication gives the copied group a new source instance. Removal of the last owning clip removes only that instance. History retains the previous snapshot for Undo.

Both editors use the same captured focus derivation. Full-source movement, click, release, and dwell facts determine the preferred trajectory before montage projection. Sparse manual geometry and Bezier controls remain separate authored state. Trusted observations use their complete source coverage and linear captured geometry. A cursor skin or focus edit cannot create an observation inside a capture gap.

Gallery conversion retains every observation, including observations inside cuts. It maps authored focus identities to the destination source instance. Gallery paints no independent cursor. The destination retains captured appearance controls with a hidden skin until the user changes them.

Recording observations can extend beyond the encoded media duration. Source groups retain these observations with their original times within the existing finite 0–86400 second limit. Projection limits timeline samples and source anchors to the owning clip. It can use a later observation to interpolate the final visible position. This corrects schema 33 admission without changing its stored fields or the original recording.

The existing immutable project revision owns derived focus caches. Preview cache signatures include complete retained source observations. A source fact outside the visible clip can affect its inferred trajectory. This field adds no storage writer, resource store, or deletion authority. Existing guarded publication and source retention contracts remain authoritative.

## Gallery transfer preservation

Montage schema 45 admits optional `resultEndLimits` on project-bound text documents. Each entry identifies an existing fragment and its visible result-time end. Earlier schemas refuse this field. Mutation retains schema 45 after field removal.

Gallery transfer records limits for result fragments that extend beyond the retained main composition. Caption projection applies these limits before bookends can extend visibility. Original fragments, words, and authored times remain stored. Intro insertion shifts limits with their fragments.

Text and style edits retain the limits. An explicit timing edit releases only the affected fragment limit. Deletion removes its limit. New fragments have no inherited limit. Existing rewrite admission refuses excluded or partially excluded fragments before disclosure.

Recording-source actions and signals retain all admitted source facts. Their counts do not use the authored-event limit. Authored events retain that limit. Shape, identity, and reference checks remain mandatory.

Transfer preparation keeps new private Library bindings in memory. The destination transaction rechecks source authority and publishes the binding, byte ownership, and project together. Refusal or transaction failure publishes none of them. Retry creates a new candidate. No compensating deletion can remove another accepted destination or shared source bytes.

Audio acquisition reconciles an insufficient metadata duration through the existing bounded Gallery decoder. It uses the retained take and replacement endpoints. It never extends duration to an unsupported requested endpoint. Source bytes and authored edits remain unchanged.

## Private voice input history

Database version 35 adds the durable `voice_input_history` store and its version 1 domain contract. The additive migration preserves every earlier row and media object. Earlier applications refuse the newer database before ordinary writes.

The store contains one bounded catalog. It owns an epoch, capture sequence, pending capture admissions, twenty retained entries, and physical deletion intents. Immutable audio lives under `sniptale-voice-input`, outside project assets and Library. Ordinary media and project backups exclude this history. Destructive migration requires separate policy and complete recovery coverage.

The history owner serializes catalog and audio transitions through one native cross-context lock and the existing persistent mutation barrier. Opening captures the epoch before waiting for the lock. Publication consumes one admitted capture token and refuses a changed epoch. Mutations compare entry identity, incarnation, revision, and audio digest. Retry advances the revision without changing the original capture order.

Publication writes immutable bytes before committing metadata and eviction intent. Failed publication preserves admitted entries. Recovery deletes orphan bytes and drains physical deletion intents.

Capture admission completes recovery before it creates a new token. Cleanup failure refuses admission and preserves accepted entries. Incomplete deletion prevents further retained publication until cleanup succeeds. Recovery does not change a live processing status. Reads never initialize, repair, evict, or rewrite data.

Raw transcript publication precedes optional correction. Correction failure retains that raw text. Deletion, eviction, erasure, and identity recreation invalidate old results. Complete local-data erasure deletes metadata and the private OPFS root even when preferences remain preserved. Its required participant verifies deletion without reopening the deleted database under the exclusive erasure barrier.

Browser termination before a completed audio Blob has no crash recovery guarantee. Retained audio remains available after recognition failure. Voice history never becomes a project source or an AI provider authorization record.


## Camera screen behavior

Gallery advanced schema 24 admits optional `screenBehavior` on cameras and their positions. Montage schema 46 admits the corresponding `cameraScreenBehavior` fields. Valid values are `shrink`, `shift` and `overlay`. Earlier schemas refuse these fields. Readers refuse future schemas. Mutation retains the required schema after field removal.

An absent field retains the previous split rendering. New split choices use `shrink`. New docked cameras retain their overlay layout. Shrink fits the complete main scene inside the free panel and preserves its aspect ratio. Shift preserves the scene scale, centers it in the free panel and clips outside that panel. Overlay leaves the main scene in place. The camera retains the selected panel in each mode. Existing source-time positions control transitions and retain the saved dock geometry and crop. Hidden or unavailable camera content does not reserve a main-scene panel.

Database version 37 changes the mediaLibrary contract to 29 and the videoProjects contract to 6. This additive migration preserves all rows, history, stores, indexes and immutable media. Earlier writers cannot admit this database. Existing project mutation, history, CAS, save and resource owners retain authority. The change adds no writer, queue, store or resource reference.

## Camera shadow direction

Gallery advanced schema 25 admits optional `shadowDirection` on a camera. Montage schema 47 admits `cameraShadowDirection`. Each field contains a mode and an angle. Modes are `classic`, `angle`, `center` and `nearest-edge`. Angles are finite degrees from zero inclusive to 360 exclusive. Earlier schemas refuse these fields. Readers refuse future schemas. Mutation retains the required schema after field removal.

An absent field retains the classic shadow. Angle mode uses clockwise degrees from the positive horizontal axis. The camera retains the angle across mode changes. Automatic modes use the current visible camera window in scene coordinates. Center mode points toward the scene center and reduces the offset to zero near that center. Nearest-edge mode blends outward directions near equal edge distances. Opposite directions can cancel. Both modes use a band equal to five percent of the shorter scene dimension. Evaluation uses no previous frame state.

Explicit directions retain shadow intensity, color and blur. They use the existing camera shadow offset length, including for the glow style. Classic glow remains centered. Split layouts and crop previews retain their existing shadow suppression. Conversion retains the authored settings. Rendering evaluates automatic directions after camera position animation. A directional shadow retains its scene angle when the camera rotates or scales.

Database version 38 changes the mediaLibrary contract to 30 and the videoProjects contract to 7. This additive migration preserves all rows, history, stores, indexes and immutable media. Earlier writers cannot admit this database. Existing mutation, history, CAS, save and resource owners retain authority.

## Border origins and two-sided phases

Gallery advanced schema 26 admits optional border `origin`, entrance `draw-both` and exit `erase-both`. Montage schema 48 admits the same values. Earlier declared schemas refuse these additions. Existing border values remain supported. Mutation retains the required schema after field removal.

Origin values are `top-center`, `top-left`, `top-right`, `bottom-right` and `bottom-left`. An absent origin retains the previous top-center behavior. A corner origin lies halfway along that corner's rounded arc. A square corner uses the corner itself. Distances follow the actual contour rather than quadrant fractions. The path retains its previous starting point and dash phase. Patterned paths retain their existing chord approximation.

Two-sided entrance reveals equal contour lengths in both directions from the origin. Two-sided exit contracts the current visible interval equally from both ends. A rotating partial segment therefore retains its interval when exit starts. Existing entrance, hold and exit clocks remain authoritative. Fade, clockwise and counterclockwise reveal, hold rotation, pulse, ripple, speed and segment settings remain available. The painter retains its rules for closed strokes and empty intervals.

Both editors retain the origin across phase changes and preserve it through conversion, history, save and reopen. Sampling remains independent of previous frames. Existing source cuts, rates and retained phase clocks keep their semantics.

Database version 39 changes the mediaLibrary contract to 31 and the videoProjects contract to 8. This additive migration preserves all rows, history, stores, indexes and immutable media. Earlier writers cannot admit this database. Existing mutation, history, CAS, save and resource owners retain authority.

## Local Montage admission revisions

`workspaceRevision` is a local admission token. An archived revision does not authorize a local write. The `videoProjects` contract version 9 owns `video_project_revisions` in physical database version 40. Each record retains one project identity and its highest allocated or retired revision.

Creation, save and restore allocate a fresh safe integer in the native domain transaction. Allocation uses the highest current native revision and retained revision. Ordinary deletion retains the current revision before it removes the project. In-place cascade writers can advance the live revision without rewriting this record. The next allocation or deletion includes that live revision. Refuse malformed records and safe-integer exhaustion instead of resetting the counter.

Restore preserves authored project content and timestamps. It allocates local admission metadata and rebinds `presentationRevision` to that local revision. Retain revision records after ordinary deletion. Remove them during whole-local-data erasure. Exclude these local counters from portable media backup and synchronization. Editors must submit their loaded numeric admission token to obtain lifetime fencing. A timestamp-only caller does not obtain that guarantee.

## Experimental immutable sync capture

The `syncCapture` contract version 1 introduced `sync_capture` in physical database version 40. The additive migration creates empty stores and preserves released domain rows and immutable objects. Migration does not enable capture.

An explicit experimental profile enables capture for a bounded Montage graph. The domain transaction saves the accepted project and its immutable native source snapshot together. Publication replay retains its original snapshot under the stable publication identity. Capture root state retains generation and causal predecessors after ordinary deletion and recreation. Capture generation does not allocate native project admission revisions.

The experiment accepts at most 32 rows in each captured collection and 1 MiB of metadata per snapshot. It retains at most 128 pending captures and refuses further capture mutations at that limit. These bounds apply to the experiment, not the planned release capacity. Missing dependencies or unsupported sidecars abort the enabled mutation. An absent or disabled profile does not read the project graph or append a capture.

Pending captures retain physical assets through the existing asset retention authority. Invalid capture data refuses physical cleanup. No verified remote settlement exists in this experiment, so pending claims do not expire. Native media bytes remain in OPFS. The capture store contains metadata and references without media Blobs. The test-only frozen database adapter reuses the existing backup inventory and codecs. The test-only apply command reuses canonical restore and commits its provenance receipt with the native replacement. Neither test-only command provides a product runtime route.

## Prepared Montage revision publication

The project owner publishes accepted native revisions through two transaction phases. The first phase writes the project and prepared project assets. The second phase writes project sidecars with the assigned local revision. Callers retain admission, revision allocation, transaction completion and resource cleanup.

Archive restoration retains its strategy, conflict checks and complete replacement policy. It publishes independent exports between the two project phases. Synchronization does not use archive replacement to apply a project revision. Saved exports remain independent unless the project uses them as editing sources.

The bounded sync command requires an enabled experimental profile and the prepared native predecessor. It checks accepted dependency generations and causal predecessors inside the project transaction. It also checks current Library identities, child records and immutable physical references. Metadata and file preparation occur before this command under the existing resource protection.

A dependency that lacks local bytes requires hydration before application. A tombstone, conflicting revision or different incarnation requires explicit resolution. Matching bytes alone do not authorize a different logical dependency. The command preserves Library relationships and refuses hidden source substitution.

Project publication, detached private-resource release and the application receipt commit together. Failure preserves current roots and the prepared candidate. A repeated accepted operation returns its receipt before checking later dependency changes. Pending local project changes refuse incoming replacement. This bounded command adds no product network route or automatic historical binding.


### Experimental media replica admission

The enabled experimental profile captures a published project-asset Library source in its native publication transaction. The capture has an independent operation identity. Pending media captures retain their physical files through the existing asset retention authority.

Project capture records the causal heads of its editing dependencies in the same transaction. It compares the current normalized source snapshot with the digest of the accepted media head. A metadata change without a matching media revision causes refusal. Legacy experimental captures remain readable for retention, but do not supply this new dependency evidence.

The media replica command accepts a prepared original-only project-asset source whose native identity is absent. It publishes the Library row, child, ref, owner, causal state and receipt atomically. An exact receipt retry returns a duplicate. A retained deleted identity, existing native source, local pending change or changed connection causes refusal. This command does not replace existing roots or release staged files. The caller must verify bytes and retain durable staging protection until publication commits.

The media source publication participant also serves backup restoration. Backup retains conflict policy, transaction completion, sidecars and cleanup. Its publication order remains Library source, thumbnail, project child, then other sidecars. The participant does not start transactions or transfer files.

This bounded integration does not implement all media writers, existing-data bootstrap, remote catalog admission or network transfer. The experimental profile remains disabled by default.


## Durable outgoing preparation

The `syncCapture` contract version 2 owns `sync_outbox` and `sync_capture` in physical database version 41. The additive migration creates an empty outbox and preserves released rows and immutable objects. Older clients refuse the newer database. The profile remains disabled unless explicitly enabled.

The outbox retains exact prepared record text, its SHA256, the remote attempt key, and immutable source bindings. Record text has a 4 MiB UTF8 bound. Each operation admits at most 64 object bindings. The persistence owner checks primitive fields, the actual record digest, and exact captured source references. The workflow owns portable representation and protocol parsing.

Preparation detaches both inputs before database admission. The owner generates `captureSha256` from the normalized capture and stores this digest with the accepted record. An accepted record must retain this exact snapshot binding, including native metadata. One native transaction checks the enabled profile, space, connection generation, and exact normalized retained capture. It does not compare the capture with the latest root generation. Thus, an earlier retained capture remains usable after later edits, deletion, or recreation. The first accepted materialization wins. Every caller must use the returned accepted record, including its original bytes and keys. A changed capture or contradictory existing operation refuses without mutation. Native failure preserves capture records, source claims, and accepted outgoing records. Reads perform no writes. Preparation neither settles operations nor releases source claims.


## Durable physical dispatch attempts

The sync persistence owner stores immutable dispatch-attempt rows in the existing sync_outbox store. Each row retains the complete physical manifest text, its digest, remote manifest key and exact object-key map. Admission detaches inputs before awaits. One native transaction checks the enabled profile, space, connection generation, unchanged preparation and retained capture. An earlier retained capture remains admissible after later root editing, deletion or recreation.

The native command returns whether it inserted the attempt. An exact repeated attempt identity returns the accepted row with created false. Contradictory reuse refuses without replacement. The workflow uses this result to reserve the prepared initial physical attempt once. Each later explicit dispatch reserves a fresh manifest UUID before network writes. Files without checked completion evidence receive independent new paths. Native failure aborts and preserves every source claim and prepared operation. Reading evidence grants no dispatch authority.

The versioned workflow keeps exact logical operation bytes separate from the physical manifest. Domain metadata uses the existing portable backup codecs. Physical manifests map logical object IDs to ordinary remote files and carry the unchanged logical record text. Neither native file locations nor credentials enter remote records. The workflow checks actual source bytes and verifies remote files with streamed size and SHA checks. It uploads new files before publishing and checking the manifest. A failed or ambiguous dispatch preserves durable evidence and local sources. Verified dispatch does not settle or release a capture. Runtime authorization, scheduling, catalog conflict admission, source release and product enablement remain separate requirements.


## Metadata catalog and selected replica preparation

The catalog scanner lists only the selected space manifest prefix. It checks bounded streamed metadata, exact physical keys, digests, canonical wire records and space identity. Discovery reads no original or export files and writes no native state. The current scanner admits at most 10000 manifest keys, 1024 pages and 64 MiB of decoded keys and manifest bytes. Each manifest has a 4 MiB bound. These limits bound the current implementation. They do not qualify full R1 capacity. A budget failure, cursor cycle or unavailable metadata fails the scan instead of publishing partial authoritative state. Invalid immutable entries retain fixed diagnostics.

The pure graph groups exact logical bytes and retains physical alternatives. Contradictory logical variants quarantine the whole operation identity independently of listing order. Missing, cyclic, quarantined or foreign-root ancestry cannot authorize a root. Known affected roots remain blocked while other roots retain their state. Concurrent heads remain explicit. Deletion remains active until an explicit restore covers the unresolved deletion ancestry. Project dependency availability compares exact current media heads with causal operation IDs. Native generation counters do not become remote ordering authority.

Selected preparation refuses deleted, blocked, conflicting or unavailable roots. Unreadable manifest ownership also prevents native admission. The workflow detaches selected metadata and target-local admission before asynchronous work. It checks actual borrowed Library files against their independently selected media revision. It stages only editing files through the existing streamed backup staging owner and creates the existing native ready journal under durable-operation protection. The native receipt uses the logical record digest across physical attempts. Missing physical copies can use another retained attempt. Failure before journal admission cleans new staged files through the existing owner. After admission, the caller publishes through the existing ready-journal retry and recovery owner. Saved exports remain discoverable metadata and ordinary remote files without forced download to open a project. The profile remains disabled until runtime, queue, catalog persistence, capacity and retention acceptance are complete.


## Checked remote file reuse

The outgoing-attempt owner records completed files separately from immutable attempt rows in the existing sync_outbox store. The workflow admits this evidence only after an acknowledged file PUT and complete size and SHA readback. An unknown-outcome PUT does not supply completion evidence, even if a later read observes the expected bytes. A server-side write can remain pending after the client loses its response. Such a path receives no new references through local reuse discovery.

Completion admission checks the enabled profile, exact connection, retained preparation, capture and immutable attempt in one native transaction. Exact retry returns accepted evidence. Failure preserves attempts, preparations and source claims. Later deletion or recreation does not change retained capture evidence or grant authority over a new operation. Read-only reuse discovery checks stored evidence and its referenced records. It grants no dispatch or publication authority. The current bounded lookup remains a pilot capacity limit, not full R1 qualification.

The workflow compares candidate digest, size, MIME type and ordinary filename with the selected source. Normal reference reuse checks current existence and size through provider stat. Explicit content recheck verifies current candidate bytes before freezing the mapping. Missing or corrupt candidates receive independent replacement paths. The sender does not overwrite the candidate. Temporary failures, authorization failures and cancellation stop the affected dispatch. Each application dispatch keeps an independent manifest even when several revisions reference the same completed file. Wire admission confines mappings to the same space Files namespace and preserves canonical record bytes. Incoming preparation checks these retained mappings through the same wire owner before existing staging and journal admission.

This correction prevents repeated remote copies of checked unchanged files. It does not qualify incremental catalog performance, persisted cross-browser candidate discovery or full outbox retention. Local source validation costs still require capacity qualification before broad enablement.

## Metadata-cost reference publication

Provider stat observes one ordinary file and its safe integer size through bounded provider metadata. It supplies no content digest, durability or release proof. WebDAV uses the existing guarded SDK PROPFIND with depth zero. The common contract does not use ETag, locks, rename or folder semantics for this observation.

Outgoing reference selection accepts native acknowledged completion evidence and caller-owned checked catalog mappings from causally ready operations. It detaches relevant strings, mappings and exclusion state before asynchronous work. The wire owner checks canonical logical bytes, physical keys and space identity. Pending, quarantined, invalid and malformed alternatives cannot supply references. Dispatch does not scan the remote namespace itself.

Normal metadata publication uses stat instead of downloading unchanged files. A missing file or changed size causes a fresh upload path. Unavailable or malformed metadata, authentication failure and cancellation stop dispatch. New uploads still require acknowledged PUT and streamed size and SHA readback before native completion admission. Reused catalog paths do not create native completion evidence.

A same-size external change can pass stat. Successful reference publication does not attest current file bytes. Actual hydration still checks streamed size and SHA before staging finalization or native publication. Explicit content recheck remains available for outgoing integrity checks. Neither dispatch policy settles captures, releases source claims or permits unload. Any later operation that can reclaim local files must independently establish its exact release conditions and current remote integrity.

This bounded flow supports another browser through a fresh checked metadata scan, including after restart. It does not persist the catalog or qualify incremental lookup capacity. Preparation still requires local originals and hashes their bytes. It does not enable metadata editing while originals are absent locally. The experimental profile remains disabled until the remaining R1 gates pass.

## Advisory sync manifest cache

The sync-catalog owner stores one bounded raw-manifest snapshot in sync_catalog_cache. Physical database version 42 adds that empty store under syncCapture contract version 3. Store classification: derived-rebuildable. Migration preserves existing source rows, claims, outbox evidence and immutable files. The cache has no publication, completion, settlement, retention or unload authority.

A snapshot contains exact manifest keys, declared sizes and raw text for one enabled native profile. Space, connection generation and profile creation identity bind its scope. The cache owner detaches and checks structural inputs before mutation. One transaction checks the current profile and atomically replaces the bounded snapshot under the existing mutation barrier. A missing, changed or recreated profile refuses a delayed replacement. Read operations never repair or rewrite storage. Cache IO refusal remains advisory and permits network fallback.

The transfer workflow performs a complete remote listing on every refresh. Only currently listed keys participate. Cached bytes must match the listed size, key digest, exact wire identity and selected space. The existing wire and domain parsers remain authoritative for admission. The workflow rebuilds causal heads, dependencies, conflicts and quarantine decisions from those checked manifests. A failed or cancelled scan returns no partial catalog and does not replace the previous cache. Cancellation during subsequent cache admission prevents graph return but can leave a complete advisory snapshot. Concurrent completed refreshes can replace this advisory snapshot in either order without changing domain state.

Normal cache hits assume immutable manifest keys. They do not detect a same-key, same-size external rewrite. An explicit cache bypass reads and checks current remote manifest bytes. No ETag or CAS property grants integrity. Media hydration still checks streamed size and SHA before native publication. This cache removes repeated metadata GET within existing pilot limits. It does not optimize parsing or remote listing. Production connection lifecycle, offline admission and full capacity remain separate release gates.

## Durable outgoing queue and verified publication

Physical database version 43 advances syncCapture to contract version 4. The migration checks the three existing sync stores without rewriting rows. It adds no store. Older clients refuse the newer database.

The sync-capture owner stores queue controls and verified manifest results under disjoint keys in sync_outbox. Connection controls bind the space, namespace generation and profile creation timestamp. Operation controls also bind the retained capture digest. Owner revisions reject stale commands. Each execution receives a fresh run ID. Stage events preserve that command revision.

The native queue offers bounded pages and an exact operation reader. Each read checks the current profile and retained capture joins. A page contains at most 128 operations and an explicit continuation cursor. The reader checks one additional row to determine continuation. The cursor binds the enrollment lifetime and last operation key. It grants no mutation authority.

Each page uses one readonly transaction. Multiple pages do not share a snapshot. Refresh from the beginning to discover later insertions before the cursor. Changed enrollment refuses an old cursor. Selected execution and recovery read only the requested operation. Unrelated invalid rows cannot prevent that selection. The legacy pilot projection retains its explicit 128-entry refusal.

Queue pause does not disable capture enrollment. Accepted local edits and tombstones still enter native capture while transfer is paused. Operation pause and cancellation fence late callbacks. They preserve captures, preparations, physical attempts, checked files and source claims. An issued write can retain an unknown outcome. Cancellation promises no remote rollback.

The transfer workflow holds one native exclusive lock per operation. Independent operations can execute concurrently. Recovery requires an available lock and the exact interrupted run. A timer cannot prove that a server writer stopped. Lock identities encode scope primitives in a fixed order.

Acknowledged manifest PUT and full size/SHA readback precede the immutable verified result. Native admission joins the exact retained capture, preparation and physical attempt. The first accepted valid result remains authoritative across alternative physical attempts. A restarted queue can consume that result without another transfer. This historical evidence grants no settlement, source release or unload authority.

A checked ready catalog can establish observed publication of the exact prepared logical bytes. The workflow excludes pending, quarantined, invalid, foreign and contradictory records. Native completion joins the retained preparation and capture. Observed publication does not create acknowledged dispatch evidence or checked-file receipts.

Every queue mutation retains bounded diagnostic transition markers in the same transaction. Markers contain fixed codes, stages, sequence numbers, hashed operation references and safe attempt IDs. Overflow retains an explicit history-gap count. Later delivery must use the existing event-history owner. These markers do not create another archive.

Queue history delivery stores one monotonic cursor per native source under a disjoint sync_outbox key. Existing queue rows and retained markers keep their formats. The cursor binds the source key digest and enrollment lifetime. Reads create no cursor. Acknowledgement joins the current profile, retained source and selected markers in one write transaction. It uses the caller's active mutation permit.

The delivery workflow opens the database before it requests that permit. It publishes fixed runtime rows through the existing event-history archive and recent runtime-log tail. Both writes must succeed before acknowledgement. The archive keeps its existing retention policy. A failed archive, tail or acknowledgement leaves native delivery eligible for retry. Logging failure cannot change transfer success or release source bytes.

Delivery is at least once. A restart after archive publication can repeat a row with the same source digest and sequence. The journal timestamp identifies delivery observation because native markers contain no original event timestamp. Explicit gap rows report markers outside bounded retention. The workflow preserves every retained native marker after acknowledgement.

Selected offscreen execution sends source hints through the existing diagnostic Port after request containment. The background receiver admits exact offscreen provenance and reloads native transitions. It coalesces duplicate hints and admits at most four pending deliveries. A hint is not a delivery receipt. Cancellation does not start another submission. The workflow and its admitted writes finish before privacy erasure can pass its mutation barrier. The queue command interface remains a separate release requirement.

Background diagnostic registration starts one local history pass and listens to its dedicated browser alarm. Each pass checks or recreates the one-minute alarm before enrollment reads. Missing enrollment clears only that alarm. Browser scheduling provides no exact deadline. Overlapping automatic passes share one promise.

Disposal prevents new sources and progress writes. Already admitted publication drains through the existing mutation barrier.

Native history discovery reads at most two pages of 64 operation rows per pass. Each page uses bounded readonly metadata queries and skips acknowledged sources without capture or file reads. A separate enrollment-bound cursor stores the last scanned native key and revision under sync_outbox. Reads create no cursor. Position writes require current enrollment, mutation admission and revision CAS.

The pass attempts each selected source before saving its page position. Failed delivery preserves the source acknowledgement for another cycle. The final page resets the position to the beginning. New rows before a saved position appear on the next cycle. Malformed rows and delivery cursors remain intact.

Discovery counts them and advances past their native keys. A backend failure or stale scan state refuses the page or progress write. Restart resumes the last committed position. These bounds require capacity qualification before production activation. Enrollment commands must schedule discovery when activation becomes available.

This experimental runner requires an explicitly admitted provider client. Production credentials, request authorization, offscreen lifecycle, Settings controls and event-history delivery remain separate release requirements. Capture enrollment is not network authorization. Future lifecycle admission must check its own revision at every actual HTTP request. The profile remains disabled by default.


## Native sync connection authorization

Physical database version 44 adds the empty sync_connection store under syncCapture contract version 5. The migration preserves existing captures, claims, queue rows, receipts and immutable files. The store contains durable authorization state. It is not a derived cache.

The connection owner separates metadata from credentials. Metadata binds one provider root and account to the native space, namespace generation and profile creation timestamp. A random incarnation and increasing revision reject stale commands and results after recreation. Pause and same-binding authentication changes preserve capture enrollment and namespace generation. An implicit root, account or space change is refused.

An authentication update first reserves the updating-auth phase with a fresh nonce. WebCrypto runs outside the native transaction. One final transaction joins the exact reservation and current profile before it publishes encrypted credentials and the active revision. Missing or replaced state refuses a delayed result. Reads do not repair storage. A failed update remains closed until an explicit update succeeds.

Credentials use the platform AES-GCM owner and version 2 context-bound envelopes. The store retains a non-exportable random CryptoKey and its encrypted envelope. The additional authenticated data binds the provider, root, account, native scope, incarnation and credential identity. A decrypt rechecks the current durable identity before returning credentials. Backups, Settings transfer, remote sync, diagnostics and logs exclude all connection rows. Core local-data erasure removes the store even when preferences remain.

Every actual HTTP request requires the exact active connection identity and current origin permission. The native admission lock covers the final checks and fetch invocation only. Headers and response bodies complete outside that lock, so independent transfers can overlap. The request executor tracks issued requests and bodies separately. After durable revocation, its caller must abort and drain the executor before reporting closure. Failed containment cannot report successful closure. A timeout supplies no containment proof.

Queue begin, effect admission and completion check connection identity inside the same transaction as their queue mutation. Missing authorization remains valid only for legacy pilot runs before any connection exists. Obsolete runs can retain failure uncertainty and historical verification evidence. They cannot complete under a replacement connection.

This foundation enables no production network ingress. Offscreen lifecycle, background permission IPC, privacy producer containment and Settings controls remain required release gates. The experimental profile remains disabled by default.


## Settings sync queue management

The native paged queue reader returns display metadata from each operation's admitted retained capture. It preserves the complete source label and performs no file read. Display sources follow the operation order and exclude the lookahead row. Failed capture admission refuses the complete page.

The sync-transfer management workflow applies selected commands through existing native revision CAS. It attempts confirmed history delivery after a successful command. A history failure retains the applied command result and leaves native events eligible for automatic discovery. Commands grant no transport, settlement or source-release authority.

Settings owns page selection, pending interaction and recovery feedback. Refresh starts a new live traversal. A stale command refuses without automatic mutation retry. The interface reloads native revisions before another command and restores keyboard focus. Queue pause controls future admissions. Cancellation retains local sources and promises no server rollback.

## Native workspace allocation

The remote-connection owner stores one workspace-allocation journal in sync_connection. The journal contains the selected parent, account, generated child root and workspace identities. It contains no credentials. Existing backup, transfer and erasure policies apply to the entire store.

Journal operations refuse an installed capture profile or connection. Initial commands require a prepared native database. One native transaction checks these records and changes the journal. The existing connection admission lock serializes commands. A random incarnation and increasing revision reject stale commands after abandonment, erasure or recreation. Reads refuse malformed records. They do not change storage.

Before waiting for connection admission, the journal owner captures the prepared database handle synchronously. This read does not initialize storage. The canonical mutation permit orders the transaction after other maintenance. Erasure closes the captured handle. A delayed command cannot reopen the database or write into its replacement. Cold database admission refuses the command. The connection page loads native state before it enables creation.

The native owner generates the workspace and bootstrap UUIDs. The child name is Sniptale- followed by the bootstrap UUID. The immutable plan precedes any remote write. The allocating phase precedes the root MKCOL request. Only a positive HTTP 201 response permits the `confirm` command to record allocated state.

An error leaves allocating state unchanged. Restart and folder existence cannot grant ownership. Explicit abandonment changes local evidence only. A replacement requires the exact abandoned identity and receives new identities. A delayed result cannot advance that replacement.

The provider primitive issues one MKCOL for the final child root. It refuses an occupied path and does not create parents or retry. The generic object store requires no collection allocation operation. Callers retain responsibility for current request authorization, cancellation and drain. The test harness checks the exact allocating identity before dispatch and records allocated state under that revision after success.

Allocated state records root allocation only. Production enrollment and request admission remain separate release requirements. Production ingress remains disabled.

## Workspace marker publication

The pure sync-workspace contract owns the fixed marker key, canonical bytes and exact workspace identity. Both the native writer and remote reader use that contract. Stream limits, cancellation and catalog inspection remain in the transfer workflow.

Journal version 2 adds a frozen marker and the preparing-marker, publishing-marker and ready phases. A readonly load accepts version 1 and returns normalized state without changing storage. The next accepted command writes version 2. Older readers refuse version 2 without deleting it.

Only allocated state permits marker preparation. The native owner freezes canonical text and its SHA before metadata directory creation or publication. A publication command reserves a fresh revision and preserves those exact bytes. Completion requires publishing-marker state and matching checked workspace, bootstrap and fingerprint values. Each command retains the native transaction, prepared-handle fence, revision check and mutation permit.

The WebDAV workflow refuses unexpected files or child prefixes before initial publication. It can reuse only an empty expected metadata directory inside a positively allocated root. It never adopts an uncertain root. The provider uses the existing guarded tsdav adapter for metadata MKCOL and conditional marker PUT. Only HTTP 201 acknowledges creation. A collision permits no unconditional overwrite, cleanup or automatic retry.

Recovery first reads the exact marker, scans the catalog and reads the marker again. Matching evidence permits native ready state without another PUT. Missing marker evidence in publishing-marker state permits an explicit fresh publication revision with the same frozen bytes. A collision or temporary transport failure permits one checked readback. Failed verification preserves uncertainty. Ready state permits inspection only. A missing ready marker never starts initialization.

The explicit test harness binds every HTTP dispatch to its current native journal revision. This proof does not activate production enrollment or establish production credential containment. Browser replay can issue more than one HTTP request for one library invocation. All such requests must retain the same key and frozen body.


## Workspace creation request lifetime

The transfer request owner shares its issued-request and response-body tracker between active connections and workspace creation. Each public adapter retains its own admission rules. The common private tracker owns cancellation and drain. It adds no durable authority or transport implementation.

Workspace requests bind the native allocation lifetime, including its parent, child root, account and random identities. Each phase client supplies the exact current revision and phase. Under the existing connection admission lock, the adapter reads native state, checks current origin permission and reads native state again. The lock ends after fetch invocation, before response headers or body completion. Installed enrollment, changed state or missing state refuses dispatch.

The named creation execution owns one run promise, one controller and one request tracker across all phase clients. It can allocate a planned root and finish the existing marker protocol. It refuses uncertain allocating state. Closing refuses new dispatch synchronously, aborts issued requests and waits for their actual completion. It also waits for the creation promise. Failed body cancellation prevents a successful containment result. A timeout grants no containment evidence.

Creation credentials stay in memory and use a callback that reads the execution's current credential reference. The execution clears its own reference after drain. This does not promise physical erasure of JavaScript strings or copies that another caller owns. Successful run results contain checked workspace evidence only.

This owner enables no production ingress or enrollment. Its production caller must close and drain it before reporting privacy or permission closure. The shared runtime integrates background and offscreen lifecycle ownership and worker recovery. Atomic native enrollment remains a separate release gate. Closing one execution does not revoke a different execution's authority.


### Allocation lifetime revocation

Workspace creation can advance its native journal revision while an offscreen execution remains active. Privacy revocation selects the exact current allocation incarnation. It abandons that lifetime at its current revision under the existing admission lock, mutation permit and transaction. Repeated revocation of the same abandoned lifetime performs no write.

A missing, replaced or malformed allocation refuses revocation. An installed profile or connection also refuses this pre-enrollment operation. The command captures its prepared database handle before its first wait. Erasure closes that handle and prevents delayed recreation. Ordinary allocation commands retain exact revision checks.

Runtime workspace snapshots are disposable projections. They do not replace native journal evidence or grant enrollment authority. No new store or persistent credential record supports this execution boundary.


### Explicit workspace allocation refusal

An explicit MKCOL 423 response grants no ownership. The creation owner records that refusal against the exact allocating revision. The native transaction restores planned with the same root, lifetime and workspace identifiers. It advances the revision and creates no new allocation. A later attempt still requires its own positive 201 response. A 405 collision never authorizes adoption or cleanup.

Only numeric status 423 admits this refusal transition. Missing responses, transport failures and other statuses cannot invoke it. A lost acknowledgement therefore retains allocating uncertainty. Native replacement, abandonment, enrollment and erasure refuse delayed refusal callbacks.


## Durable queue retry schedule

DB45 adds the nonunique syncQueueDue index to sync_outbox. Its keys contain enrollment scope, connection incarnation, deadline and native primary key. The synchronous upgrade preserves existing rows and bytes. It advances the syncCapture contract to6.

The native queue owns deadlines, automatic retry counts and bounded schedule progress. Legacy readers supply schedule defaults without writes. Explicit maintenance initializes old rows under current native admission. Discovery advances a durable cursor through bounded index pages. Native index keys preserve progress past malformed rows and order equal deadlines. Discovery wraps to revisit earlier insertions. It preserves malformed evidence.

Native time and the existing operation lock control run admission. An alarm grants no authority. Temporary failures retain source evidence and store a delayed retry atomically. Retry delays start at30seconds, increase exponentially and stop after five automatic retries. A manual retry resets this budget. Permanent failures require explicit action.

Running rows retain their exact run authorization and a future recovery-check time. Metadata deferral cannot change their command revision. Recovery requires the existing exclusive operation lock. Pause, cancel, replacement and erasure refuse stale claims. Published operations have no retry deadline.


## Checked workspace enrollment

The remote-connection owner installs checked workspace enrollment in one native transaction. The first source is an exact ready allocation. Callers select its native identity, not a root, account or purported checked marker. The owner derives the connection binding and workspace identity from retained native evidence.

The transaction installs the capture profile, connection metadata, protected credential and narrow enrollment receipt together. It refuses existing capture, outbox, connection or orphan credential state. A failed transaction preserves ready evidence and installs nothing. The command captures its prepared database handle before crypto or admission waits. Erasure closes that handle and prevents delayed recreation.

The receipt identifies a repeated successful source without replacing credentials or rotating identity. The connection retains the checked workspace spaceId, bootstrapId and marker fingerprint. Legacy experimental metadata lacks this identity and retains its previous decoding behavior. Legacy decoding does not establish checked enrollment.

JOIN must produce a native ready source through its selected-root verification workflow before it uses this activation boundary. A read-only catalog snapshot or structurally valid identity cannot activate a connection. Production ingress and remaining release gates remain closed.


## Existing workspace JOIN readiness

The remote-connection owner records one selected JOIN root and account under workspace-join in sync_connection. Its planned, checking and ready phases use native incarnation and revision checks. The row contains no credentials or catalog payload. CREATE refuses a present JOIN intent. JOIN permits only absent or valid abandoned CREATE evidence.

Only exact checking evidence can become ready after the existing marker, catalog, marker verification. A repeated check retains the previously checked workspace identity as its expectation. Explicit abandonment or lifetime revocation erases this read-only intent without remote cleanup. Source absence, replacement and erased database handles refuse delayed completion.

Ready JOIN uses the existing atomic connection installer and receipt. It derives endpoint, account and workspace identity from native evidence. Retained abandoned allocation evidence cannot select the joined root or adopt old outbox data. Receipt replay checks source kind as well as identity and binding.

The read-only workflow drains issued requests before it records readiness. Active close revokes the intent, aborts and drains IO. A settled, contained failure retains checking for explicit retry. Production producer registration and activation handoff remain separate required release gates.


## Unified workspace source selection

SyncWorkspaceSource identifies allocation or JOIN with an exact native identity. The strict parser reconstructs this value at storage and IPC boundaries. The native selection reader parses both rows in one readonly transaction. Conflicting live intents or malformed evidence refuse selection without repair. An abandoned allocation can coexist with JOIN but cannot choose its endpoint.

The selection projection contains no credential or catalog payload. Its bindingKey encodes immutable parsed selection fields. Phase and revision changes do not change that token. It preserves permission consistency checks and grants no mutation authority. Retained native ready evidence remains readable after enrollment for receipt replay.

Coordinator containment precedes the existing atomic enrollment installer. Native source checks, prepared database capture, credential protection and transaction rollback remain with that installer. No runtime snapshot replaces native readiness or the enrollment receipt.

The queue accepts invalid-workspace as a bounded failure code. Marker verification occurs after claim and before the first remote effect. Temporary refusal retains the existing retry budget and deadlines. Invalid identity requires explicit action and preserves local source evidence.


## Project dependencies created before sync enrollment

A supported native project save can reference a Library original from before sync enrollment. If its causal state is absent, the sync-capture owner records that original in the same project transaction. The project references the actual media operation and generation from that transaction. Later saves reuse the accepted head only while its native metadata digest matches. Malformed, empty or mismatched existing evidence still refuses the complete transaction.

The native transaction commits the dependency and project together. A later capture failure, including queue capacity, rolls back both captures and the project mutation. Parallel saves share the initial media head through native transaction serialization. Local-only saving creates no capture rows. Enrollment does not scan or upload the existing Library.

This change freezes native metadata and immutable file references, not file bytes inside IndexedDB. The existing capture claims retain those files. Outgoing preparation checks their bytes through the existing codecs. Production activation still requires a producer that enqueues dependency operations before dependent publication.
