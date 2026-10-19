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
