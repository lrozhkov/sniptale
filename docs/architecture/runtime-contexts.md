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

Screenshot area selection with a countdown keeps the page interactive during the countdown, then freezes a viewport raster and its element hit regions before activating selection. Content selection owns the disposable geometry and raster overlay; content screenshot orchestration crops that same retained raster. Existing selection frames, manual rectangle controls and element hover/click selection are reused. Hit regions for rounded, clipped or transformed areas are retained at screenshot-pixel precision, including exposed background pixels. Removing or moving a source element after freezing must not change its saved bounds. Acquisition rejects DOM, scroll or layout changes while the privileged frame request is pending, rather than pairing different page states. A viewport size or scale change ends the frozen selection. Cancellation, replacement and runtime disposal release the session; no geometry or extra raster is persisted. Untimed area selection and local capture adapters retain their dynamic behavior. The raster image is mounted inside a dedicated non-serializable, non-clonable closed shadow tree created by native DOM APIs in the content isolated world. The shared open UI root remains page-readable: its raster host exposes no image, URL, bytes or private-root reference. This isolation relies on Chromium's isolated-world API wrappers and closed-root retargeting; privileged extension inspection and browser debugging are outside the host-page threat model.

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
