# Runtime contexts

`tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json` owns runtime roots, manifest ownership, entrypoints, and documentation markers. This document owns runtime coordination rules.

## Coordination

Apply the runtime dependency rule in [code organization](code-organization.md#dependency-direction) and the residency rules in [shared topology](shared-topology.md). Put runtime-specific coordination rules in this document.

Parse cross-runtime messages at the receiver. Treat sender identity as context proof, not operation authority. Require a trusted local gesture or owner-scoped short-lived capability for privileged actions initiated by page DOM events. Validate capability or lease scope, owner, operation, identity, generation, purpose, freshness, expiry, and replay state before side effects.

## Background

`apps/extension/src/background/index.ts` is the service-worker entrypoint. The background runtime owns privileged APIs, lifecycle, route authorization and dispatch, capture and recording orchestration, and background-local state.

`apps/extension/src/contracts/messaging/contracts/runtime/background-ingress.data.ts` owns background-ingress descriptors. Keep runtime handler and authorization bindings exhaustive over its IDs. Keep dispatch policy in the action kernel and domain behavior in named route or lifecycle owners. Keep legacy family routers as adapters.

## Content

`apps/extension/src/content/index.tsx` is the content entrypoint. Content owns page DOM access, Shadow DOM UI, capture preparation, parsing, export preparation, and apply-back. Treat host DOM as untrusted. Restore page state changed for capture.

`apps/extension/src/features/drawing` owns renderer-neutral drawing documents, geometry, and transforms. `apps/extension/src/content/drawing` owns DOM and Canvas rendering, input, session lifecycle, and reversible page-preparation effects. Persist palette and tool preferences only. Keep the active tool and drawing document disposable.

Screenshot area selection with a countdown keeps the page interactive during the countdown, then freezes a viewport raster before activating selection. Content selection owns the disposable geometry and raster overlay; content screenshot orchestration crops that same retained raster. Existing selection frames, manual rectangle controls and element hover/click selection are reused when the page stays stable during capture. Hit regions for rounded, clipped, transformed and bounded SVG areas are retained at screenshot-pixel precision, including exposed background pixels. SVG bounds that exceed the shared pixel-sampling budget use manual rectangle selection locally; ordinary HTML outside those bounds retains element targeting. Uncached pixel probes also have a cumulative browser-probe time budget; exhausted pixels remain manual-only while ordinary HTML targeting continues. A bounded geometry traversal retains completed hit regions and leaves unvisited regions manual-only instead of discarding the raster. Acquisition and budget fallbacks emit fixed diagnostic codes without page content. Removing or moving a source element after freezing must not change its saved bounds. Acquisition treats host DOM mutations, scroll, viewport and tracked layout changes during the privileged frame request as uncertainty. Only metadata changes proven not to alter visible geometry or generated content retain element targeting. When acquisition is uncertain, the captured raster remains available for manual rectangle selection, while element hover/click targeting is disabled for that session. The frozen surface keeps the selection crosshair in both modes; manual-only selection shows an accessible drag instruction until the session ends. A viewport size or scale change ends the frozen selection. Cancellation, replacement and runtime disposal release the session; no geometry or extra raster is persisted. Untimed area selection and local capture adapters retain their dynamic behavior. The raster image is mounted inside a dedicated non-serializable, non-clonable closed shadow tree created by native DOM APIs in the content isolated world. The shared open UI root remains page-readable: its raster host exposes no image, URL, bytes or private-root reference. This isolation relies on Chromium's isolated-world API wrappers and closed-root retargeting; privileged extension inspection and browser debugging are outside the host-page threat model.

## Extension and editing pages

Extension and editing page runtimes own their page shells and page-local workflows. The changing inventory is projected in [generated project facts](../engineering/project-facts.md) from the [machine runtime registry](../../tooling/qa/guards/architecture/runtime-topology/runtime-topology.data.json). Durable state remains in named persistence owners. Apply the [video-editor layering rules](video-editor-layering.md) inside the video-editor runtime.

## Offscreen

`apps/extension/src/offscreen/offscreen.ts` owns delegated media capture, recording, viewport, export, clipboard image delivery, and voice-input work. `apps/extension/src/background/offscreen-document` owns document lifecycle.

Desktop screenshots delegate source selection, countdown, and frame capture to the offscreen document using `getDisplayMedia`; popup dismissal must not end an accepted capture. The shared document declares `DISPLAY_MEDIA` alongside `USER_MEDIA` and `CLIPBOARD`. Background owns delivery and releases its preparation on completion or failure.

Accept offscreen commands only from the verified background channel. Validate freshness, command binding, and rate limits before updating idempotency state. Key side-effect deduplication by binding generation and request, job, or recording identity. [Platform tradeoffs](platform-patterns-and-tradeoffs.md#security-tradeoffs) owns the legacy field-name semantics.

Keep reusable voice input under `workflows/voice-input`, `background/voice-input`, and `offscreen/voice-input`. Register each consumer policy explicitly. Scope events to the active consumer Port. Translate the private offscreen session nonce to consumer identity in background. Serialize video recording, desktop capture, and speech recognition through one offscreen media-activity lease.

## Effect sandbox

`apps/extension/src/effect-runtime-sandbox/index.html` is the manifest sandbox for EffectV1 frame evaluation. It has no extension API authority. [EffectV1 bundles](video-effect-bundles.md#runtime) owns its runtime contract.

## State and egress

`apps/extension/src/background/capture/jobs/state-machine.ts` owns capture and download jobs. `apps/extension/src/composition/persistence/export-ledger/index.ts` owns project-export ledger state. Tie advisory runtime maps to these durable or revisioned owners.

Use `apps/extension/src/features/ai/privacy/index.ts` and the content egress pipeline for sanitized AI payloads. Apply [data handling](../security/data-handling.md) to secrets, retention, diagnostics, and headers.

## Runtime changes

For a new or changed runtime, update the runtime registry, manifest or build input, entrypoint ownership, documentation marker, and drift proof. Declare a privileged background route once beside its parser with handler, authorization, sender, freshness and replay, policy-state, failure-response, and owner metadata.

## Tour preview sandbox

`apps/extension/src/tour-preview-sandbox/index.html` is a manifest sandbox for exact prepared guide and tour HTML preview. It receives one bounded HTML Blob with an explicit representation from its parent with source, origin and per-mount nonce validation. It owns its child Blob URL and has no extension APIs, storage, automatic network or mutation authority. The child executes the unchanged standalone file under its hashed CSP. Readiness and failure messages are bound to the current opaque frame and nonce and carry no commands. The existing effect sandbox retains its stricter head CSP; extension-page CSP is unchanged.

The scenario-page `view=guide|tour` route loads a committed project through the read-only scenario persistence owner before preparing a disposable HTML artifact. It does not mount editor state or invoke publication recovery, autosave or export-history writes. Library links pass only project identity and representation. [Scenario viewing from Library](scenario-library-viewing.md) owns opening and refresh semantics.

## Browser context menu

The background context-menu owner projects preferences into Chrome menu descriptors and routes existing action IDs. Settings owns the editor; the composition settings owner persists preferences in sync storage under `sniptale_settings`. A large v2 layout is compressed and split into quota-safe sync items referenced by a manifest in that settings item; load reconstructs and validates all parts before exposing the layout. The editor saves valid tree changes after a short debounce, serializes writes, and offers retry after failure. A pending valid draft is journaled in extension-page local storage until the sync write succeeds, so closing settings during a failed write does not discard it. Local-data erasure removes this journal. Other settings are unaffected.

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
| Window size | Enabled window-target viewport presets | Off: specialist workflow; no menu when no presets exist |
| Settings | Open settings | On: discovery and recovery |

All commands retain their existing action handlers. Screenshot quick actions and window presets come from their respective authoritative catalogs. The recommended v2 tree groups screenshots, video, export, copy title and link, and optional window presets in coherent submenus. Individual available actions can be placed in custom nested sections.

Camera-only recording, scenario authoring, drawing and AI interaction remain in their existing popup/editor/page surfaces: they need additional input or an active editing session. The audit does not identify a missing one-click command necessary for the accepted browser-menu workflow. No arbitrary commands, scripts or URLs can be configured. The editor does not request permissions or start actions.

New profiles use the recommendations above. Existing explicit boolean preferences are preserved. Restore replaces the tree with the recommended hierarchy and order; it preserves the master enabled switch and saves automatically.

### Structure and behavior

There is one Sniptale root. A v2 tree supports up to 64 named sections at up to 64 levels and 1024 total nodes. The editor shows the active tree beside available unused actions; drag and drop or keyboard controls reorder and nest nodes. Removing a section requires confirmation and moves its descendant actions to the section's parent in their original order. Stored disabled or temporarily unavailable commands remain in the data for recovery. Empty sections are omitted from the browser menu. An empty configured menu has no root item. Page capabilities continue to control capture, export, recording and link commands; a section with no visible descendants is hidden for that page.

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

This v1 shape remains supported for existing settings. Its array order is authoritative. Exactly one `root` section and exactly one occurrence of every known block are required, including disabled blocks. Other section IDs match `[a-z][a-z0-9-]{0,31}`. Titles are trimmed plain text of 1–40 characters without control characters; the root title is empty. Unknown fields, unknown block identities, duplicate or missing identities, invalid titles, excessive sections and unsupported versions are invalid. A v2 layout contains recursive `section` nodes (`id`, `title`, `enabled`, `children`) and `command` leaves (`command`, `enabled`, optional `title`); section and command IDs must each be unique. Legacy blocks project into the recommended command hierarchy without changing explicit v2 tree positions.

Settings transfer includes this value in `interface.preferences.contextMenu`, using the existing v1 envelope and domain. A missing layout projects the recommended tree. Missing booleans use current defaults on normalization; explicit old booleans retain their values. A supplied layout is atomic: an incomplete or malformed tree rejects import before mutation, preserving the saved menu. A missing contextMenu field leaves the current setting unchanged during selective import. Stored v2 layouts can be repaired on read by dropping invalid nodes and retaining valid descendants; imported layouts use strict validation. Each save validates the full tree again before writing.

Action availability remains an independent runtime decision. Section titles and positions convey no action authority, and action/preset IDs cannot be introduced by imported section data.
