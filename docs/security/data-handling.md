# Security data handling

This document owns retention, secret handling, network egress, transfer, and diagnostic policy. The machine inventories own exact sinks and owner paths:

- `tooling/configs/qa/security-storage-ownership.data.json`
- `tooling/configs/qa/security-network-ownership.data.json`

## Secrets

- Keep provider metadata separate from credentials.
- Never put plaintext API keys, passphrases, authorization headers, or derived keys in storage, logs, UI responses, exports, diagnostics, or traces.
- Encrypt stored provider secrets with AES-GCM and a unique IV per secret.
- Apply the accepted [transparent-mode tradeoff](../architecture/platform-patterns-and-tradeoffs.md#security-tradeoffs).
- Limit secret writes to `secretStorageOwners` in the storage inventory.
- Limit secret-bearing headers to `secretHeaderOwners` in the network inventory.

Passphrase protection is optional. Its persistent metadata may contain only the mode, version, KDF parameters, salt, and encrypted verifier. [Local secret crypto](../../packages/platform/src/security/local-secret-crypto.ts) owns the algorithm and parameter values. Derived keys remain in background memory and disappear when the MV3 worker stops.

Write a transition marker before changing protection mode or resetting secrets. Recovery must finish committed cleanup or fail closed. A reset removes provider secrets because a forgotten passphrase is unrecoverable.

An unlock request may persist session metadata under `AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY`. Limit the record to request identity, extension-page owner, purpose, status, timestamps, and a fixed failure reason. Route unlock through the background owner and the Settings page. Do not render an unlock prompt in a content page.

## Retention

Temporary material expiry moves eligible roots to Trash without releasing bytes. Maintenance repairs retained project sources before expiry. Failure or an uncertain dependency graph retains unverified data. Automatic Trash deletion remains a separate opt-in operation with its own retention period.

Accepted project mutations retain primary Library sources and recording mirrors permanently in the same transaction. Accepted current, historical and recovery resources retain their Library origins. Rejected attachments do not promote sources. Source Trash and project Trash remain separate metadata.

- Retain page content or user media only for an explicit product feature and an owner registered in the storage inventory.
- Keep published media bytes in immutable OPFS objects. Recording recovery retains immutable encoded blocks in IndexedDB.
- Keep identity, ownership, lifecycle, and publication state in IndexedDB.
- Publish an OPFS object and its IndexedDB graph atomically through the persistence-transition owner.
- Treat previews, thumbnails, caches, staging objects, and temporary jobs as non-authoritative. Timeline WebP thumbnails use the existing local preview-cache IndexedDB database, bounded to 32 MiB, 2048 frames, and 14 days. Reads do not renew retention. Project deletion and local-data erasure remove them and invalidate pending writes.
- Exclude local media, temporary payloads, and caches from sync, automatic export, diagnostics, and traces.
- Include data in backup only when the backup contract explicitly names it.
- Abort active writers before local-data erasure. Remove registered browser storage, IndexedDB, OPFS, caches, staging objects, and legacy stores covered by the erasure contract. Check absence before reporting success.
- Apply retention limits and cleanup events from `sensitiveRetentionOwners` in the storage inventory.

Web Snapshots may retain sanitized HTML and CSS, non-credential form state, and a raster after an explicit user action. Label a viewport-only raster as partial, store it as `page-viewport-preview.png`, and never publish it as `page-screenshot.png`. Remove recognized password, sign-in-code, and payment state from retained DOM. Mask those controls in the raster when they are reachable. Exclude scripts, handlers, unsafe URLs, storage, cookies, API bodies, and live JavaScript state.

Disclose that screenshots may still contain visible private pixels from images, canvas, video, or closed shadow roots.

Voice input has three global states: Off, Chrome, and a configured model. Off hides dictation controls and prevents recognition and retry. Model recognition sends completed microphone audio to the configured transcription provider. Optional correction sends recognized text and the dedicated local prompt to the configured text provider. Neither stage includes page content, project context, or recording identifiers.

Private voice history retains at most twenty completed model recordings, including failed recognition attempts. Chrome does not record audio or store transcripts in this history. History initialization removes legacy Chrome entries through the existing deletion queue. Audio resides under the separate `sniptale-voice-input` OPFS root. The canonical `voice_input_history` store retains bounded metadata and transcripts. Only Settings exposes this history. Library, ordinary media backups, project exports, sync, diagnostics, traces, and AI request history exclude it.

Settings transfer changes the Chrome language and mode. It preserves the local microphone, enabled state, recognition backend, model approvals, and correction switch. Model recognition uses the language from the selected model configuration. An unset model language permits automatic detection. Correction instructions use the AI prompt domain.

An explicit retry uses the current configured models and does not renew the recording's retention order. Failed correction preserves the raw transcript. Failed recognition preserves admitted audio for retry. Stop ends capture and permits the pending result. Cancel, field invalidation, and disposal prevent late insertion. Privacy erasure aborts and drains capture and processing before deleting private voice data, including when preferences remain preserved.

Voice correction prompt commands reserve erasure coordination before entering the AI settings queue. Erasure waits for these admitted commands before deleting their stored values.

Interim recognition events remain disposable. Final annotation text becomes ordinary content after the user explicitly commits it. Final text inserted into Scenario fields uses the existing editing, Undo, and local autosave path. The user does not need a separate Apply or Save action. Gallery review retains final dictated comments as a local recovery draft until Save, discard, or media deletion.

Explicit media backup includes accepted review history and its comment recovery draft. It excludes private voice history. Annotation reports include committed comments only. Neither comments nor recognition events enter sync, diagnostics, or logs.

LLM request history may retain only timestamp, model ID, request kind, result count, status, and fixed error code. Normalize legacy prompt-bearing records before returning them. Before model egress, disclose the provider, model, prompt inclusion, page-data classes, and metadata-only history.

Export-time calibration retains only numeric prediction-error ratios, completion timestamps and constrained codec/render-profile buckets in local browser storage under `sniptale_export_time_history`. The advisory owner keeps at most 100 observations, ten per profile, for 30 days. It excludes media, filenames, project identities, content and device fingerprints. Exclude it from sync, backup, export, diagnostics and traces. Reads do not renew retention or fix storage.

Only successful rendering records an observation. Unavailable storage or coordination discards it. Abort checks and nonqueued persistence permits protect writes during local-data erasure. Its inventory removes and checks the key even if preferences remain preserved.

## Network egress

- Resolve AI secrets and build authorization headers only in the registered background transport.
- Allow `credentials: 'include'` only for registered owners after same-origin URL validation.
- Fetch user-enabled cross-origin Web Snapshot assets anonymously with `credentials: 'omit'`.
- Accept cross-origin Web Snapshot responses only from public HTTPS final URLs.
- Install the Declarative Net Request session guard before a redirect-enabled Web Snapshot fetch. Reject the fetch if guard installation fails.
- Block HTTP and syntactically private or local redirect hops. Treat DNS rebinding as a residual browser limitation because fetch and Declarative Net Request do not expose the resolved IP.
- Keep links inert in the embedded Web Snapshot viewer. Open a checked HTTP(S) target there only after the user enables the default-off control and clicks the link. Downloaded standalone HTML may expose checked HTTP(S) links in a new tab with `noopener noreferrer` and same-file fragment links. It must not load external assets or run page scripts.

## Import and export

Media backup payload layouts `library-folders-v2`, `library-folders-v3` and `library-folders-v4` treat authored strings as text rather than binary signatures. Canonical domain owners check resource roles and portable references. Image-document Canvas source/background/blur slots still require declared object references. Restrict PNG window-header transport to the existing normalized PNG/64-pixel decoration profile. Import revalidates the declared JSON/PNG inventory, MIME, UTF-8 and expanded metadata limits directly in the ZIP before runtime staging.

Quick-edit project metadata requires archive layout `library-folders-v4`. Older readers reject this layout before staging or root publication. Current readers reject project metadata in legacy layouts. V4 retains the V3 resource profile, direct anchors and bounded shared-object checks.

Opaque legacy review recovery retains its existing owner policy. Backup diagnostics contain fixed failure reason/phase and bounded byte metrics, without user content, object identities or raw exceptions. Scenario HTML archive references use the MIME essence `text/html` while preserving the immutable UTF-8 body.

Admit V3 and V4 shared entries through an explicit table and a matching direct physical anchor. Import checks exact logical roles and inventory, SHA256 over actual streamed bytes, size and MIME before staging. It rejects undeclared/unused table rows, alias chains and future layouts. Scope export deduplication to one explicit backup. Preserve selected readable files and independent logical identities.

Do not create a global content index. JSON compression does not relax expanded or decoded favicon budgets. Staging and rollback remain scoped to individual roots.

Treat every imported file and archive as hostile input. Parse it as `unknown`. Before mutation, enforce the format version, schema, exact inventory, path and MIME policy, and size and resource limits. Before that mutation, also enforce identity uniqueness and storage quota. Revalidate after user confirmation when the flow has a preview step. A failed import must not publish a partial durable aggregate.

Settings transfer includes transferable persisted controls and explicitly selected video-editor effect catalogs (checked imported documents and bundled assets). The effect-bundles persistence owner stores source-qualified preset/default/enabled preferences in local browser storage under `videoEffectPreferences`, bounded to 1 MiB. Settings transfer includes these preferences and retains unavailable effect/style references. Built-in effect definitions remain immutable extension resources. Exclude those definitions from settings backup.

Exclude credentials, credential-presence flags, cryptographic material, protection state, device identifiers, projects, media, caches, permission grants, and runtime state. Include prompts or private base URLs only after point-of-action disclosure. Enforce the limits from [Settings transfer limits](../../apps/extension/src/contracts/settings-transfer/limits.ts). Surface an unverified rollback as a blocking failure.

Page Package transfer uses bounded sequential chunks and temporary OPFS staging. Do not assemble the archive in service-worker memory. Before download or Library publication, check the manifest, intent, exact inventory, paths, and MIME profile through an abortable stream. Before that download or publication, also check sizes and entry SHA-256 values through that abortable stream. Discard staging after success, failure, cancellation, erasure, or owner release.

Extended page evidence is opt-in. Store its DOM projection as plain text, never render it as HTML, and pass every scalar through the diagnostic sanitizer. Exclude form state, cookies, storage, authorization data, bodies, scripts, stylesheets, `srcdoc`, file values, and live JavaScript state. Disclose that visible page text, ordinary attributes, and safe URL query values may remain.

## Diagnostics

- Sanitize persisted, exported, logged, or traced diagnostics with `packages/platform/src/observability/diagnostics/sanitizer.ts`.
- Limit exceptions to `diagnosticSanitizerOwners` in the storage inventory.
- Use fixed codes and bounded metrics instead of raw exceptions, content, identifiers, URLs, blobs, transcripts, audio, or media bytes.
- Apply the sanitizer again at the final persistence or export sink.

The registry-driven `verify-secret-storage`, `verify-sensitive-retention`, `verify-fetch-ownership`, and `verify-diagnostic-sanitization` controls enforce owner admission. Change the matching registry and this policy together when a security decision changes.

Gallery trash retains the existing local media and project graphs after a reversible remove gesture. It introduces no additional storage backend, network transfer or diagnostic payload. Retention is indefinite by default. An independent opt-in age policy permits permanent cleanup during Gallery maintenance. Automatic cleanup must not detach project references.

Manual permanent deletion requires confirmation. Privacy erasure includes retained trash through the existing stores and asset owners.


Standalone scenario HTML exports retain the exact native guide or tour file as an immutable local OPFS body after an explicit export action. The `scenario-html-exports` persistence owner publishes its catalogue identity, reference and body ownership atomically through the existing ready-journal transition. Native file commit precedes advisory catalogue retention. A retention failure does not claim a saved Library file. Replay preserves a committed filename or Trash state.

Catalogue deletion, source-root deletion and archive replacement release body ownership through the existing durable journal for physical deletion. Checked local-data erasure removes these bytes with the existing OPFS store and IndexedDB graph.

An explicit scenario backup includes the saved HTML body, mode and filename through portable object identities. These immutable files contain the visible authored content and resources chosen at export time. Metadata privacy projections do not rewrite their content. Exclude these immutable files from sync, automatic export, diagnostics and traces. Legacy metadata-only catalogue entries have no recoverable file and must never regenerate a current project under a historical export identity.

Treat restored HTML as hostile. Read-only preview admission runs inside the opaque sandbox. It checks an extension-trusted runtime digest plus the restrictive mode-specific CSP.

The trusted runtime digests are the current extension-supplied bundled digest and the explicitly pinned digests below. The sandbox admission owner holds the pins. Guide pins are the pre-caption-alignment and pre-viewer-controls digests. Tour pins are the pre-marker-controls, pre-stage-background, pre-manual-playback, pre-full-view, pre-highlight-animation, pre-narration-controls and pre-background-music digests.

Historical trust stays representation-specific: guide pins never apply to Tour, and tour pins never apply to Guide. Both the exact CSP and executable bytes must match the trusted digest, and archive-supplied hashes cannot add trust. Admission performs these checks before mounting the original file. The saved file receives no privileged extension APIs or same-origin access.

Background preset metadata is local-only under `sniptale_background_presets`. It retains at most 20 immutable bundled entries and 200 custom entries. Entries have bounded names, Library identities, enabled state and order. It stores no image bytes or network URLs. Exclude it from sync, settings transfer, diagnostics and traces.

Local-data erasure removes it even if preferences remain preserved. Custom images are explicitly retained in Library through the existing asset publication owner. Removing a catalog entry does not remove its Library material. Missing or trashed materials cannot be selected. Editor insertion keeps its existing frozen bytes and source provenance without publishing a second Library card.

### Explicit speech editing

Gallery speech editing retains project authority separately from private dictation history. Explicitly accepted transcripts and phrase edits become project content through review history. Accepted generated audio uses the existing private project-asset publication and reference-retention rules. Project backup includes those accepted references and text. It excludes jobs, secrets and temporary previews.

Ready-made SDK adapters assemble speech, standard transcription, and audio-chat provider headers inside the admitted background transport. `background/ai/audio/request.ts` owns credential construction and guarded network effects. Bothub uses the SDK request transformation hook for its explicitly selected proxy format.

The background audio request owner sends saved speech text or explicitly configured private dictation audio to the selected provider. For transcription, it sends authorized source intervals. It rejects redirects. It omits ambient credentials and referrers. It bounds response bytes and elapsed time.

Provider error bodies never enter UI, logs or diagnostics. There is no hidden retry after an ambiguous paid POST.

Full video editor transcription uses the same audio job, ticket, staging and transport owners. It requires a separate project clip scope. The top-level editor document must match the scope owner. The saved project revision, snapshot timestamp, clip membership and native source interval must agree. A missing, changed or trashed project refuses admission. Source bytes resolve only through canonical project, Library, recording or scenario readers.

Recheck project authority before POST and temporary input publication. Staging checks project scope under its ticket lock and after upload. A stale project cannot read staged input. Exact scoped cleanup remains available after source deletion. This clip scope authorizes transcription only. It requires an explicitly approved provider. It does not authorize speech or the combined montage mix.

Full video editor speech uses a separate project text scope. The scope names the saved project, text document and fragment. It includes the project revision, timestamp and a SHA256 hash of the selected speech basis.

The hash covers project creation identity, document identity, binding, text, text revisions, intervals, clock and every projected placement. The basis retains each native source slice and its project placement. Caption appearance and descriptive provenance do not change this basis. The exact approved text and revisions must match before POST.

The caller explicitly approves the provider. Background repeats provider and canonical text checks before POST. Background repeats canonical text checks after the response.

The project text scope does not authorize source byte reads. Project text can produce speech without source audio or a current clip placement. Dormant, partially excluded and repeated text keeps its exact captured placement state. Generation does not choose an accepted audio destination.

After asynchronous project integrity checks and basis hashing, admission reads fresh canonical metadata. Restores that keep earlier revisions still invalidate the hash when text, binding or placement changes. Temporary audio checks this scope before and after writes and reads. Exact ticket cleanup remains available after text or project deletion.

Scenario speech sends the exact saved hotspot or annotation text and explicitly selected voice parameters to the disclosed provider. Provider approval exists only for the mounted form and clears when its selected provider changes. The request binds the saved project revision, action identity and exact text hash. Source admission reads committed state without recovery writes. Neither action labels nor unrelated project content enter the speech payload.

Generated Scenario audio remains disposable until explicit Apply. Successful previews survive individual batch failures and cancellation within the mounted form. Apply uses ordinary Scenario audio publication with frozen source text and expected narration checks. A competing edit rejects the old take without replacing current narration. Each accepted import advances the current aggregate revision for the next explicit import. Closing the form releases its preview URLs and temporary staging. Accepted narration uses existing project assets, history and backup rules.

Gallery text editing uses the one-shot `review-text` LLM session purpose and typed `sniptale-gallery-review-text` Port. The exact top-level Gallery document, capability purpose, context hash and committed workspace scope must agree. The selector exposes only an opaque SHA256 provider-destination binding. Background compares provider identity, destination and model code before permission or secret activation and again before POST. Provider payload contains the disclosed prompt, texts, language and numeric result-video intervals plus fixed output-contract instructions.

Full video editor text editing uses the same purpose, Port and job owner. Its scope identifies one committed project text document. The top-level editor document must match that scope. Gallery accepts only workspace scope. The full editor accepts only project scope.

The saved project revision, timestamp, document, selected text and projected placements must agree with the disclosed context. A missing, changed or trashed project refuses admission. Background repeats this check after the final model admission and before POST. After asynchronous Effect integrity checks, it reads the committed project metadata again. That metadata must match the checked snapshot, including restored content that retains earlier revision values. The scope check reads no audio or video bytes. It does not change storage.

Each authored fragment keeps one input identity across its placements. Optional numeric `ranges` retain every projected placement, including gaps, overlaps and repetitions. Fragment `start` and `end` enclose those placements. They do not imply continuous placement. The context retains no clip, lane, asset or project identity. Whole-document scope means the selected text document. Partially excluded or excluded fragments refuse disclosure. The caller must not silently remove them from whole-document scope.

It excludes workspace/asset identities, sound, frames and video. The complete context has a 16KiB bound and a conservative2500-token application output budget. Refuse excessive scope instead of silent chunking. JSON proposal text is additionally bounded to48KiB and checked against the selected IDs and explicit timing/structure permissions. Jobs are memory-only, do not retry paid calls, own cancellation before authorization awaits and drain through the existing privacy-erasure exclusion holder alongside audio jobs.

History uses the existing metadata-only JSON request record. Raw prompts, text, responses, provider errors and credentials are never history fields.

`composition/persistence/assets/audio-staging.ts` retains disposable input and previews under `sniptale-assets/audio-jobs`. Objects have random operation identities, a 32 MiB maximum (transcription inputs are additionally limited to 24 MiB), and a ten-minute access expiry. Successful jobs discard input. The page discards previews on release. Subsequent writes inspect at most 256 metadata entries for expired crash remnants.

Expired bytes may remain physically until that cleanup or checked local-data erasure. This does not imply scheduled cleanup. Exclude staging from backup, sync and diagnostics. Scopes distinguish original source, a specific voiceover clip, saved video text and saved Scenario action text. Staged handles cannot cross those targets.

Scenario staging checks the canonical saved source before write admission and again inside the existing mutation barrier. It checks the same source before and after asynchronous staged reads. Discard checks issued scope and handle metadata without requiring a surviving project or unchanged text. A failed or cancelled request cannot recreate a project after deletion or publish narration.

Original admission resolves the current Library source and compares immutable identity, MIME and size to the durable workspace. Provider admission additionally checks physical bytes and native coverage (complete original source for transcription, retained spans for synthesis and voice clips). It repeats this validation before egress and after response. Every write rechecks the current durable workspace and original source binding inside the existing persistence transition. A delayed page extraction cannot recreate bytes after erasure.

Full erasure cancels background operations and removes the existing asset root.

Quick-editor preview preferences retain only four bounded resolution, frame-rate, paused-quality and FPS-display choices locally under `sniptale_quick_preview_preferences`. They contain no content or device identifiers. Exclude these preferences from sync, project history, backup, export and diagnostics. Missing or failed storage leaves the current session editable without claiming a durable save. Reads do not fix storage.

Writes acquire a nonqueued persistence permit before joining their local ordered queue. They hold it through the write. Thus, a stale queued save cannot follow pending erasure. Checked local-data erasure removes this key unless the user selects the existing preserve-preferences option.

The Library maintenance journal is user-requested local advisory diagnostic history at `sniptale_library_maintenance_log`. It retains only fixed operation/reason codes and reconstructed messages, UTC timestamps and bounded numeric metrics. It contains no source IDs, names, URLs, media, user content or raw exception text. The owner bounds it to 512 entries and 256 KiB. It evicts oldest rows.

It merges consecutive identical blocked/error/skipped outcomes within one minute, with explicit first/last timestamps and repetition count. A cross-context lock reloads current state before append. Admit an erasure permit before queueing. The permit drains before unconditional erasure removes the key. Read is write-free.

Storage/coordination failure loses advisory events without failing cleanup or logging to Chrome errors. Offscreen submissions use the bounded internal runtime Port. Background accepts maintenance envelopes only from the exact offscreen document, reconstructs the fixed-code input and applies its own erasure admission before storage. Retain no caller-supplied message or content. The journal never authorizes deletion or fix.

Exclude the journal from sync and backup. Explicit filtered JSONL export reconstructs and sanitizes each entry again at the final sink.

The user-requested Settings System → Events and logs surface also retains runtime logger summaries at `sniptale_runtime_diagnostic_log`, separately bounded to 512 rows/256 KiB. Each event contains UTC times, level, runtime label, logger namespace, sanitized short message and repetition/drop counts. Captured producers use fixed summaries or controlled codes/numeric metrics. DOM headings/selectors, project identities, native media constraints and raw exceptions must not be interpolated into the first message. Discard attached arguments, documents, media, provider bodies and raw error stacks.

The shared diagnostic sanitizer protects retention and explicit JSONL export. This is local-only, excluded from backup/sync and unconditionally removed with local data. Runtime capture batches at most64 events over one second. It drops overflow explicitly. It holds an admitted mutation permit through batching and writing.

It reloads under an exclusive cross-context lock. Storage failure never retries, logs recursively or blocks product work. No event means no timer or storage activity.

Events and logs additionally retains local compressed history in `sniptale-event-history`, through the diagnostics owner. History and recent views have a 14-day access cutoff. ZIP archives total at most 50 MiB, plus an active JSONL segment of at most 1 MiB. Rotation occurs on the next append after a UTC day change or size boundary. Remove oldest archives to meet the compressed size budget.

On subsequent writes, remove expired segments. Expired bytes can remain while idle. Exclude them from reads and exports. Introduce no polling or scheduled media traversal. Each recent browser-storage view retains a 512 rows/256 KiB cap.

Trim these views on write. Full ZIP export is explicit, includes ordinary numbered JSONL members, and checks, bounds inflation and resanitizes one segment at a time. Exclude the archive database from sync and backup. A required local-data-erasure participant clears active chunks, metadata, catalog and archives and checks emptiness. Runtime capture also buffers a bounded next batch during a slow write.

Overflow remains counted, and each batch needs fresh nonqueued erasure admission.

Multimodal recognition sends the selected full native audio interval, including original-source Cuts, to the explicitly approved provider. It also sends additional locally configured recognition instructions, model instructions and the optional operation prompt. Model settings declare the attachment wire protocol. It is never inferred from model names or selected by hidden paid probes. Credentials stay in the existing background audio request owner, URLs remain under provider URL/permission admission, and redirects/retries remain forbidden.

Additional instructions have a 10000-unit bound under sniptale_ai_audio_transcription_prompt in local storage. Register them as sensitive data for erasure. Settings transfer permits their explicit selection with rollback coverage. Introduce no new source-media or prompt diagnostic sink. Bound and parse response JSON, text and native timing locally.

Schema admission does not guarantee semantic or timing accuracy, so publication remains explicit.

Recorded keyboard rhythm is local project content: anonymous observed onset/repeat timing may be retained only outside protected password, OTP and payment contexts. It contains no printable key/code sequence, InputEvent.data, field value, composition text or clipboard/file payload. Protected contexts have no precise cadence or sound count. Explicit private markers apply through visible ancestry and the composed event path. The content runtime uses Chrome DOM root existence and mode only to recognize closed shadow targets.

It never reads inner fields or values. Closed roots retain coarse activity coverage without assuming their field contents. When root privacy cannot be established because the capability is absent or fails, opaque targets also receive coarse coverage. Known native controls and exposed open roots remain eligible after ordinary privacy checks. Transition into a protected context clears held state at its last established public observation, without saving the private edge time.

Pointer gesture capture retains delivered geometry/button phases without reading selected text, DOM snapshots or dataTransfer. Exclude these facts from diagnostics/traces. They remain in explicit project/telemetry backup only through the existing bounded domain codecs.

## Recording timing observations

Original event/cursor observations and document/phase clock descriptors remain local project content in the existing telemetry store and explicit backup. Protected keyboard activity retains coarse intervals and a safe phase identity only, without private cadence or key data. Optional calibration samples one original frame from the same freshly acquired TAB track inside offscreen. On result, failure or timeout, release the frame and reader without stopping the borrowed source. There is no helper tab, frame transport, new capture source, network or diagnostic content sink.

Timing confidence never authorizes recording and never destroys observations. Existing generation/source binding and primary command authorization remain mandatory.

Final observation handoff uses the existing content-to-background runtime transport. Its receiving boundary checks the complete telemetry DTO, browser provenance, observation domain, current recording UUID, source tab, top frame, extension sender and active/outgoing document identity. Repeated final snapshots merge by stable identities into the same session owner, without a new persistence writer or diagnostics sink. Pause and stop always release input observers, including exceptional finalization paths.

## Recording recovery retention

Gallery displays interrupted sources and published sources whose canonical files are unavailable. Readable saved videos keep internal protection without a separate copy or cleanup action. Existing canonical deletion controls the lifetime of their protection. Discovery only reads existing data.

Recording recovery retains encoded user media in the canonical IndexedDB database. The recordings owner controls both recovery stores. Session metadata and ordered immutable blocks are authoritative user data. They are not temporary jobs, staging objects, or caches. A strict-durability transaction commits each block and its session boundary before acknowledgement. This requests a disk flush under IndexedDB semantics.

The operating system and hardware must honor durability requests. Volatile encoder frames and pending in-memory blocks cannot survive process termination or power loss.

Errors and successful publication retain the recovery copy. The `published` flag records canonical commit in the same transaction. Encoded output completion alone does not set this flag. Automatic expiry, Trash cleanup, and orphan cleanup cannot delete an unreferenced recovery copy. Only explicit discard, admitted canonical deletion, or complete local-data erasure deletes these bytes.

A refused canonical deletion retains its recovery copy. Complete local-data erasure deletes both recovery stores and their epoch header. Delayed operations must not recreate deleted records.

Recovery preserves original blocks, including any suffix outside the playable prefix. Explicit raw download exports the original bytes in order. Failed recovery or download retains the source for another attempt. Recovery does not send media to a network service. Exclude recovery data from sync, diagnostics, traces, and automatic export.

Explicit media backup v6 excludes pending recordings and retained safety copies. Recovery UI exports interrupted sources. Ordinary Library download exports successfully saved videos. A destructive migration requires complete backup coverage of recovery data first. This feature requires no new extension permissions.


## Temporary page recovery

Page recovery can retain drawings, frame annotations, text edits, styles, and design notes in private local storage. Each set expires 45 minutes after the last user change. Reading, restoring, or retrying a write does not extend that period. The receiver refuses expired sets before disclosure. A background alarm deletes expired bytes. Startup also deletes expired bytes after browser closure or delayed alarm delivery.

A new edit without Restore replaces the previous set. Explicit Reset, Clear, and panel Close delete the set. Recovery never stores page data in host storage, sync, diagnostics, or automatic exports. Payloads contain bounded data only. The content history owner validates the complete set before applying its existing sanitized DOM operations.

Loss of native session proof prevents Restore, including after a complete browser restart. The extension retains unclaimed bytes only until their original expiry. Complete local-data erasure excludes producers, drains admitted writes, revokes connections, and deletes both recovery keys. Old producers cannot recreate the deleted set.


## Quick-action appearance preferences

Quick-action presets can retain explicitly configured static text, website addresses, normalized icons, and raster backgrounds in the existing local preference list. A background is limited to 2 MiB. An icon is a bounded normalized PNG with sides at most 64 pixels. These values follow the existing preference lifetime. Preserving preferences during local-data erasure also preserves these configured values. Reset or action deletion removes its appearance. Automatic page metadata and captured pixels never enter the preset list.

Settings transfer removes embedded background and icon bytes. The projected preset disables the removed image or icon and retains its other controls. Import refuses embedded artwork before storage admission. Preset artwork and text do not enter sync, diagnostics, or automatic exports.

Favicon acquisition requires the configured option and an invoked capture. It uses the existing bounded anonymous public HTTPS policy with no redirects. Opening the Settings form does not fetch a favicon. Missing page data is omitted. Desktop decoration does not read a web page. Rendering checks encoded input, dimensions, and the combined raster budget before bitmap or canvas allocation.
