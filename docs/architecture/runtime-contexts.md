# Runtime contexts

`tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json` owns runtime roots, manifest ownership, entrypoints, and documentation markers. This document owns runtime coordination rules.

## Coordination

Apply the runtime dependency rule in [code organization](code-organization.md#dependency-direction) and the residency rules in [shared topology](shared-topology.md). Put runtime-specific coordination rules in this document.

Parse cross-runtime messages at the receiver. Treat sender identity as context proof, not operation authority. Require a trusted local gesture or owner-scoped short-lived capability for privileged actions started by page DOM events. Check capability or lease scope, owner, operation, identity, generation, purpose, freshness, expiry, and replay state before side effects.

## Background

`apps/extension/src/background/index.ts` is the service-worker entrypoint. The background runtime owns privileged APIs, lifecycle, route authorization and dispatch, capture and recording orchestration, and background-local state.

`apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.data.ts` owns background-ingress descriptors. Keep runtime handler and authorization bindings exhaustive over its IDs. Keep dispatch policy in the action kernel and domain behavior in named route or lifecycle owners. Keep legacy family routers as adapters.

## Content

`apps/extension/src/content/index.tsx` is the content entrypoint. Content owns page DOM access, Shadow DOM UI, capture preparation, parsing, export preparation, and apply-back. Treat host DOM as untrusted. Restore page state changed for capture.

`apps/extension/src/features/drawing` owns renderer-neutral drawing documents, geometry, and transforms. `apps/extension/src/content/drawing` owns DOM and Canvas rendering, input, session lifecycle, and reversible page-preparation effects. Persist palette and tool preferences only. Keep the active tool and drawing document disposable.

Screenshot area selection with a countdown keeps the page interactive during the countdown, then freezes a viewport raster before activating selection. Content selection owns the disposable geometry and raster overlay. Content screenshot orchestration crops that same retained raster. If the page stays stable during capture, reuse existing selection frames, manual rectangle controls and element hover/click selection. Retain hit regions for rounded, clipped, transformed and bounded SVG areas at screenshot-pixel precision.

Include exposed background pixels. SVG bounds that exceed the shared pixel-sampling budget use manual rectangle selection locally. Ordinary HTML outside those bounds retains element targeting. Uncached pixel probes also have a cumulative browser-probe time budget. Exhausted pixels remain manual-only while ordinary HTML targeting continues.

A bounded geometry traversal retains completed hit regions and leaves unvisited regions manual-only instead of discarding the raster. Acquisition and budget fallbacks emit fixed diagnostic codes without page content. Removing or moving a source element after freezing must not change its saved bounds. Acquisition treats host DOM mutations, scroll, viewport and tracked layout changes during the privileged frame request as uncertainty. Only metadata changes proven not to change visible geometry or generated content retain element targeting.

When acquisition is uncertain, the captured raster remains available for manual rectangle selection. For that session, disable element hover/click targeting. The frozen surface keeps the selection crosshair in both modes. Manual-only selection shows an accessible drag instruction until the session ends. A viewport size or scale change ends the frozen selection.

Cancellation, replacement and runtime disposal release the session. Do not persist geometry or an extra raster. Untimed area selection and local capture adapters retain their dynamic behavior. Mount the raster image inside a dedicated non-serializable, non-clonable closed shadow tree. Create that tree with native DOM APIs in the content isolated world.

The shared open UI root remains page-readable: its raster host exposes no image, URL, bytes or private-root reference. This isolation relies on Chromium's isolated-world API wrappers and closed-root retargeting. Privileged extension inspection and browser debugging are outside the host-page threat model.

## Extension and editing pages

Extension and editing page runtimes own their page shells and page-local workflows. [Generated project facts](../engineering/project-facts.md) projects the changing inventory from the [machine runtime registry](../../tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json). Durable state remains in named persistence owners. Apply the [video-editor layering rules](video-editor-layering.md) inside the video-editor runtime.

Private source retirement uses a shared native asset-resource reader gate. Gallery acquires it before source/workspace admission and releases it after ordered session disposal drains. Standalone Montage and Image, including embedded Image, admit their mounted page children only after acquiring a reader. Scenario editing sessions and complete backup reads additionally hold the same gate through their existing project/resource adapters. Gallery export holds a separate reader through preparation and output settlement.

Offscreen project export acquires before consuming persisted input and transfers the reader to its detached job until final cleanup. Bounded pending export inputs protect the preceding handoff. Causal maintenance requests an exclusive gate with `ifAvailable` and never waits on mounted readers. Browser termination releases native leases. Canceled beforeunload does not release them.

These leases protect source identity and bytes, and introduce no second document authority.

## Recording clock

TAB recording calibration stays in the offscreen source/encoder owner. Before countdown, it samples an original frame from the same freshly acquired track. It bounds the native epoch offset by acquisition and receipt. It maps initial/resumed source timestamps to the encoder’s chosen PTS. Reader cancellation never stops the borrowed track.

Content reuses the four-timestamp context exchange. Input observation starts before optional calibration. Missing or over-budget calibration never removes observations or disables listeners. Persisted document/phase descriptors keep original observation time separate from media mapping. Presentation consumers derive source-media copies, show approximate timing and its measured or unknown accuracy, and omit proven pause-excluded tails without rewriting facts.

Real pause/stop still stop observation. The implementation uses no helper tab, frame transfer or alternate capture source.

## Offscreen

`apps/extension/src/offscreen/offscreen.ts` owns delegated media capture, recording, viewport, export, clipboard image delivery, and voice-input work. `apps/extension/src/background/offscreen-document` owns document lifecycle.

Offscreen `READY` and challenge-bound readiness probes attest to installed command listeners. They do not await IndexedDB admission, publication recovery, export reconciliation, or Library maintenance. Each caller owns its readiness timeout and abort. Only a checked runtime failure or an explicit lifecycle close invalidates the document. An inconclusive probe does not authorize closing a potentially active document.

Page Package downloads explicitly prepare offscreen admission and publication recovery before collecting pages or holding staged/output publication leases. Preparation has a caller-owned deadline and cancellation. It does not cancel shared data readiness. Lease creation requires completed preparation on the current connection and rejects a cold connection or a connection after termination without queuing admission under publication locks.

Storage-backed commands prepare data lazily. Admission and publication recovery coalesce within one database connection. Termination invalidates them. Failed flights can retry. Recording registers its source binding and reserves `BEGIN` before preparation, with a bounded deadline and immediate STOP cancellation.

Export registers its job before preparing data or consuming its input. Cancellation prevents late capture or rendering. It does not cancel a shared database admission. Export capabilities and cancellation use their existing session ledger without IndexedDB readiness. Raster commands clean expired jobs locally rather than clearing all jobs on startup.

Gallery schedules one cancellable maintenance pass after the first successful snapshot of its mounted library. Presentation refreshes, focus and maintenance sync events do not restart or cancel that pass. Unmount cancels it. Orphan discovery reads object IDs, reference keys and active writing/ready claims without parsing domain documents or holding a lifecycle lock. Up to 32 candidates acquire the existing lifecycle and available object locks without waiting.

One fresh retention snapshot checks the batch before durable intent for physical deletion and deletion. Aborted passes and busy locks defer maintenance. Failure is advisory and durable deletion intent remains replayable. Ordinary publication recovery preserves its existing full-maintenance contract. New recording preparation admits the database and reconciles only the previous recording completion outbox.

It does not join global publication, archive or deletion recovery. Other asset-consuming offscreen commands retain explicit publication recovery.

Desktop screenshots delegate source selection, countdown, and frame capture to the offscreen document using `getDisplayMedia`. Popup dismissal must not end an accepted capture. The shared document declares `DISPLAY_MEDIA` alongside `USER_MEDIA` and `CLIPBOARD`. Background owns delivery and releases its preparation on completion or failure.

Accept offscreen commands only from the checked background channel. Check freshness, command binding, and rate limits before updating idempotency state. Key side-effect deduplication by binding generation and request, job, or recording identity. [Platform tradeoffs](platform-patterns-and-tradeoffs.md#security-tradeoffs) owns the legacy field-name semantics.

Keep reusable voice input under `workflows/voice-input`, `background/voice-input`, and `offscreen/voice-input`. Register each consumer policy explicitly. Scope events to the active consumer Port. Translate the private offscreen session nonce to consumer identity in background. Serialize video recording, desktop capture, and speech recognition through one offscreen media-activity lease.

## Effect sandbox

`apps/extension/src/effect-runtime-sandbox/index.html` is the manifest sandbox for EffectV1 frame evaluation. It has no extension API authority. [EffectV1 bundles](video-effect-bundles.md#runtime) owns its runtime contract.

## State and egress

`apps/extension/src/background/capture/jobs/state-machine.ts` owns capture and download jobs. `apps/extension/src/composition/persistence/export-ledger/index.ts` owns project-export ledger state. Tie advisory runtime maps to these durable or revisioned owners.

Use `apps/extension/src/features/ai/privacy/index.ts` and the content egress pipeline for sanitized AI payloads. Apply [data handling](../security/data-handling.md) to secrets, retention, diagnostics, and headers.

## Runtime changes

For a new or changed runtime, update the runtime registry, manifest or build input, and entrypoint ownership. For that runtime change, update the documentation marker and drift proof. Declare a privileged background route once beside its parser. Include handler, authorization, sender, freshness and replay, policy-state, failure-response, and owner metadata for that route.

## Tour preview sandbox

`apps/extension/src/tour-preview-sandbox/index.html` is a manifest sandbox for exact prepared guide and tour HTML preview. It receives one bounded HTML Blob with an explicit representation from its parent with source, origin and per-mount nonce validation. It owns its child Blob URL and has no extension APIs, storage, automatic network or mutation authority. The child executes the unchanged standalone file under its hashed CSP. Readiness and failure messages are bound to the current opaque frame and nonce and carry no commands.

The existing effect sandbox retains its stricter head CSP. Extension-page CSP remains unchanged.

The scenario-page `view=guide|tour` route loads a committed project through the read-only scenario persistence owner before preparing a disposable HTML artifact. It does not mount editor state or invoke publication recovery, autosave or export-history writes. Library links pass only project identity and representation. [Scenario viewing from Library](scenario-library-viewing.md) owns opening and refresh semantics.

## Browser context menu

The background context-menu owner projects preferences into Chrome menu descriptors and routes existing action IDs. Settings owns the editor. The composition settings owner persists preferences in sync storage under `sniptale_settings`. The composition settings owner compresses and splits a large v2 layout into quota-safe sync items. A manifest in that settings item references them.

Load reconstructs and checks all parts before exposing the layout. The editor saves valid tree changes after a short debounce, serializes writes, and offers retry after failure. The editor journals a pending valid draft in extension-page local storage until the sync write succeeds. Thus, closing settings during a failed write does not discard the draft. Local-data erasure removes this journal.

Other settings remain unchanged.

### Audit and recommended configuration

| Block | Available scenario | Recommendation |
| --- | --- | --- |
| Screenshots | Page preparation and enabled screenshot quick actions, including desktop capture | On: primary capture entry point |
| Video | Tab, area, viewport preset, screen/window recording | On: primary recording entry point |
| Export | Page export and JSON/Markdown copy | On: page capture and structured reuse |
| Image editor | Open standalone image editor | Off: also accessible from popup and Library |
| Video editor | Open standalone video editor | Off: also accessible from popup and Library |
| Library | Open saved files and projects | On: retrieve results |
| Copy title and link | Rich, Markdown and plain-text formats | On: lightweight page sharing |
| Window size | Enabled window-target viewport presets | Off: specialist workflow. No menu when no presets exist |
| Settings | Open settings | On: discovery and recovery |

All commands retain their existing action handlers. Screenshot quick actions and window presets come from their respective authoritative catalogs. The recommended v2 tree groups screenshots, video, export, copy title and link, and optional window presets in coherent submenus. Individual available actions can be placed in custom nested sections.

Camera-only recording, scenario authoring, drawing and AI interaction remain in their existing popup/editor/page surfaces: they need additional input or an active editing session. The audit does not identify a missing one-click command necessary for the accepted browser-menu workflow. No arbitrary commands, scripts or URLs can be configured. The editor does not request permissions or start actions.

New profiles use the recommendations above. Preserve existing explicit boolean preferences. Restore replaces the tree with the recommended hierarchy and order. It preserves the master enabled switch and saves automatically.

### Structure and behavior

There is one Sniptale root. A v2 tree supports up to 64 named sections at up to 64 levels and 1024 total nodes. The editor shows the active tree beside available unused actions. Drag and drop or keyboard controls reorder and nest nodes. Removing a section requires confirmation and moves its descendant actions to the section's parent in their original order.

Stored disabled or temporarily unavailable commands remain in the data for recovery. Omit empty sections from the browser menu. An empty configured menu has no root item. Page capabilities continue to control capture, export, recording and link commands. A section with no visible descendants is hidden for that page.

### Configuration and transfer

`ContextMenuSettings` retains `enabled` and its nine `show*` booleans. Its optional `layout` is a versioned object:

```json
{
  "version": 1,
  "sections": [
    { "id": "root", "title": "", "items": ["showScreenshots", "showVideo", "showExport", "showGallery", "showPageLinkCopy", "showSettings"] },
    { "id": "tools", "title": "Tools", "items": ["showImageEditor", "showVideoEditor", "showWindowResize"] }
  ]
}
```

This v1 shape remains supported for existing settings. Its array order is authoritative. Require exactly one `root` section and exactly one occurrence of every known block. Include disabled blocks. Other section IDs match `[a-z][a-z0-9-]{0,31}`.

Titles contain trimmed plain text of 1–40 characters without control characters. The root title is empty. Unknown fields, unknown block identities, duplicate or missing identities, invalid titles, excessive sections and unsupported versions are invalid. A v2 layout contains recursive `section` nodes (`id`, `title`, `enabled`, `children`) and `command` leaves (`command`, `enabled`, optional `title`). Section and command IDs must each be unique.

Legacy blocks project into the recommended command hierarchy without changing explicit v2 tree positions.

Settings transfer includes this value in `interface.preferences.contextMenu`, using the existing v1 envelope and domain. A missing layout projects the recommended tree. Missing booleans use current defaults on normalization. Explicit old booleans retain their values. A supplied layout is atomic: an incomplete or malformed tree rejects import before mutation, preserving the saved menu.

A missing contextMenu field leaves the current setting unchanged during selective import. Stored v2 layouts can be fixed on read by dropping invalid nodes and retaining valid descendants. Imported layouts use strict validation. Each save checks the full tree again before writing.

Action availability remains an independent runtime decision. Section titles and positions convey no action authority, and action/preset IDs cannot be introduced by imported section data.

### Audio operations

`background/ai/audio` owns the `sniptale-gallery-audio-job` Port for Gallery and Scenario pages. The transport retains its existing name. Background checks the exact top-level extension document and binds its consumer for the Port lifetime. Gallery permits transcription and video speech. Scenario permits only authored Scenario speech. A trusted sender cannot submit another consumer's scope.

For Gallery, background replays the durable workspace. It checks the workspace revision and discriminated original/voiceover target.

It admits only a continuous authorized native interval. Original transcription includes Cut intervals. Timeline projection remains independent. Original jobs bind the current Library immutable locator and physical object to the workspace source identity, MIME and size. A caller-supplied asset ID alone grants no access.

Original mute and gain do not suppress explicit recognition, while original transcription admits cuts and synthesis retains its existing retained-interval policy. Speech additionally binds the saved phrase identity, revision, text and explicitly selected voice parameters. Transcription receives a fresh one-use ticket before Gallery extracts mono PCM16 WAV into local staging. Execute must present the same ticket and bounded handle. Gallery is the trusted byte-extraction owner.

The receiver checks staging scope, WAV shape and duration before egress.

Before the POST, recheck provider configuration, secret availability and optional origin permission. One deadline covers authorization, upload preparation and response. Disconnect, cancel and local-data erasure abort active jobs. Erasure reserves exclusion before cancellation and waits for writes. Worker restart loses all tickets and the page observes Port interruption.

No automatic retry or resumable paid job exists. Ports carry only parsed text, timing data, fixed errors and scoped handles, never audio bytes or credentials.

Scenario speech binds the saved project revision, slide, action and SHA256 of the exact authored text. The canonical gate uses `readScenarioViewingSnapshot`, without publication recovery or editor writes. It checks the source before egress, after response and at temporary staging boundaries. Scenario requires an approved provider identity before permission or secret activation. The shared runtime-neutral client resides under `workflows/audio-jobs`. Gallery and Scenario retain separate workflow and UI owners.

The Scenario page explicitly saves the source before generation without changing its autosave preference. The mounted form owns sequential requests, cancellation and disposable preview Blobs. Apply remains unavailable until generation settles. Each explicit Apply uses the current page snapshot and aggregate revision through the existing narration import. It checks frozen source text and expected narration after asynchronous preparation. Serial Apply uses each accepted snapshot for the next import, without another writer or atomic batch operation. Earlier accepted imports survive a later failure. Project replacement or page disposal ends the form lifetime.

`background/ai/llm/review-text-job` and its typed `sniptale-gallery-review-text` Port own Gallery AI text editing. They use the existing one-shot LLM capability authority with purpose `review-text`. It does not masquerade as a DOM, scenario or audio operation. Consume the exact top-level Gallery document and disclosed context/destination binding once. Recheck committed workspace text and result-time projection before POST.

A connection owns cancellation before any authorization await. Disconnect/deadline/erasure stop the same one-shot flight. Worker interruption never resumes it. Runtime wiring composes audio and text jobs behind the existing erasure holder, reserving both before cancellation and draining both before storage erasure. The existing LLM transport and metadata-only history remain the provider and diagnostic owners.

Gallery alone owns the disposable editable proposal and explicit text-only durable Apply through the current review session.

Gallery caption appearance belongs to the authored scene and individual text fragments. `features/video/review/caption-plan` owns disposable cue projection and stable overlap slots. `workflows/video-review/render-captions` uses the existing bundled font and canonical output geometry for manual preview and both final render paths. Text visibility on the timeline is independent from burn-in. Fragment export receives the full edit time map from export lifecycle and samples global main time.

Intro/outro do not inherit main captions. Enabled unsafe layouts report affected fragment identities and reject final rendering before encoder/output writes. Watermark, camera, key and comment geometry stays with existing painters. Disclose conservative motion bounds as possible conflicts. Editor-only comments retain their original burn-in flags even when shown in the manual preview.

The existing Gallery presentation session owns first-frame readiness and capture cleanup. A native `VideoFrame` constructor `InvalidStateError` can precede the first capturable frame despite video metadata readiness. It waits on one cancellable native frame callback. Other capture, decoder and allocation failures remain failures. Caption layout preparation leases and releases a 1×1 measurement surface through existing render-resource admission, then retains only layout data.

Frame sampling does not remeasure authored text.

Gallery reads committed metadata before scheduling provenance rewriting, scenario backfill, draft/trash cleanup and publication recovery as advisory background maintenance. Check cancellation between maintenance stages and cleanup candidates. Selected-object integrity and deletion revalidation remain authoritative. Storage estimation updates separately and discards results from superseded refreshes. Video project listing parses metadata without opening or hashing every project resource.

Gallery project-usage requests use the native advisory reverse index, coalesce invalidations while pending, and bound loading to eight seconds. They do not invoke global project listing or scenario recovery. After-render maintenance fills missing legacy keys and publishes the existing library sync event when it completes. Media switches and unmount discard stale results. Routine lookup and maintenance failures do not emit extension error-log entries.

The internal `sniptale:diagnostic-summary:v1` Port carries only bounded logger summaries from content and offscreen to background. The diagnostics port owner checks the extension sender ID, tab/frame/document metadata and document protocol. It admits offscreen only for the exact extension offscreen document without a tab. It assigns content/offscreen labels itself. It limits concurrent ports and messages.

It closes connections after three seconds. It has no query or action response authority. Content connects only on a log event with a per-second budget and no reconnect timer. The background advisory storage owner performs privacy-erasure admission and bounded batched writes. Offscreen uses the same runtime-only client and never requires chrome.storage.

Extension pages and background install the logger observer directly with their runtime labels. Structured maintenance uses an explicit maintenance envelope on that same bounded Port only from the exact offscreen document. Background checks the fixed operation/reason catalog and numeric metrics, then appends through the existing erasure-admitted maintenance owner. Content cannot submit maintenance facts. Submission is advisory, with no remote durability acknowledgement.

Console verbosity and external tracing remain independent.

Gallery subtitle sidecars use `features/video/review/subtitle-export` with the existing editor time map and frame-quantized presentation main offset. Local file options occupy the exclusive text inspector. They never mutate authored text, anchors, visibility or audio. Hidden burn-in phrases remain eligible by default. Explicit SRT overlap normalization affects disposable cues only.

Literal payload escaping and bounded cue/text expansion precede the existing Gallery Blob download owner, which reports completion/interruption independently from backing-file release failures.

Multimodal audio transcription is an explicitly declared transcription transport. The background audio request owner resolves the existing provider Chat Completions URL. It constructs the selected protocol and fixed timed schema. The protocol is standard input_audio or an explicitly configured Bothub media data URL. It parses the unknown response before returning it.

Gallery prepares one complete native interval, including original Cuts, within the existing byte budget. It does not silently chunk or fall back to another paid transport. Mode, granularity and bounded operation instructions are frozen into the disposable job identity. User-editable additional instructions use the serialized AI-settings authority and existing Settings query/mutation routes. Model supplied timing remains coarse and requires proposal review before Apply.

On pagehide or explicit disable, outgoing recording documents publish their final observation snapshot through the existing runtime message transport. They publish before the old tab response channel disappears. The background recording owner admits only its current recording UUID and top source-tab document. The existing telemetry aggregator deduplicates stable phase/fact identities when navigation also returns the same snapshot. Observation seconds count active recording time rather than document age.

Descriptors retain original document timestamps for media projection. Pause/stop release observers even if finalization fails.

## Recording completion

`background/media/video/runtime/recording-completion.ts` owns Stop admission, terminal outcomes, recovery projection, retries, and publication of IDLE. Start rollback, activation timers, and lifecycle routes submit results to this owner. They do not independently clear an accepted Stop. The lease module serializes storage mutations and supplies cache snapshots. Offscreen performs recorder cleanup. The popup displays the resulting runtime state.

Legacy lease removal fails if Stop owns the recording. If Stop starts during pending removal, the lease module restores the removed lease before returning failure. Confirmed completion, an authorized durable saved result, and verified local-data erasure supply explicit deletion authority. Start cleanup joins an existing Stop operation. A failed cleanup retains the original identity and permits no rollback to IDLE.

Commanded Stop records terminal intent in the existing browser-session lease before dispatch to offscreen. Version2 terminal entries retain the source binding, disposition, outcome and remaining cleanup step. Existing version1 prepared and active entries remain readable.

Terminal intent does not prove successful cleanup. Confirmed offscreen completion permits surface cleanup, camera-grant cleanup and lease removal, in that order. Background publishes IDLE only after those steps complete. Concurrent event and ACK consumers share the pending completion. A retry resumes the remaining cleanup steps.

Terminal recovery projects STOPPING with an error. It never restores active recording from terminal evidence. The original trusted popup can retry Stop with its unexpired capability. Terminal authority does not permit pause, resume, settings changes or camera control after grant revocation.

Unknown offscreen state cannot prove successful deletion. Offscreen retains the exact terminal outcome for repeated commands within its lifetime. Missing or failed evidence does not become success through an idle Stop. Terminal evidence remains for the browser session after capability expiry, without extending control authority. Explicit local-data erasure contains failed or unknown terminal state through the existing recovery owner. It verifies offscreen termination, drains side effects, and removes verified surface and lease authority before storage erasure. Ordinary Stop cannot use this erasure recovery.
