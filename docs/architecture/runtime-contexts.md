# Runtime contexts

`tooling/qa/core/runtime-topology.data.json` is the machine authority for runtime roots, manifest ownership, entrypoint files, and documentation markers. This document interprets those boundaries and records the coordination rules that code review must preserve.

## Coordination model

Runtime folders do not import sibling runtime implementations. Shared wire/data contracts use `packages/runtime-contracts`; browser and transport adapters use `packages/platform` or `apps/extension/src/platform`; reusable presentation uses `packages/ui`; app lifecycle, product workflows, and durable state use concrete app-core owners including `apps/extension/src/composition/persistence`.

Cross-runtime messages are typed and parsed at the receiving boundary. Sender identity proves context, not operation authority. Privileged actions initiated from page DOM events require a trusted local gesture or an owner-scoped, short-lived capability before crossing into background routes.

Capabilities and leases bind the minimum applicable sender, tab or document, operation, request or job, generation, purpose, and expiry. Stale, mismatched, expired, and replayed authority fails closed before side effects.

## Background routing

The service worker entrypoint is `apps/extension/src/background/index.ts`. It owns privileged browser APIs, service-worker lifecycle, route authorization and dispatch, capture/recording orchestration, background-local state, and coordination with extension pages and the offscreen document.

`apps/extension/src/background/runtime/routing/action-kernel/routes.ts` is the route registry. `apps/extension/src/background/runtime/routing/action-kernel/owned-route-inventory.ts` supplies owner and authority metadata, and `apps/extension/src/background/runtime/routing/authorization/policy-registry.ts` owns runtime authorization policy. These registries and their drift tests change together.

Action-kernel code owns execution policy and dispatch, not domain behavior. Feature behavior enters through named route and lifecycle entrypoints. Legacy family routers remain adapters; authorization and dispatch proof runs through listener/action-kernel paths.

Shared route DTOs, typed contexts, response builders, and cross-feature background ports live under `apps/extension/src/background/routing-contracts`. Route handlers consume owner-local state or a named preauthorization handle and do not re-decide authority after dispatch.

## Content script

The content entrypoint is `apps/extension/src/content/index.tsx`. This runtime owns page DOM access, Shadow DOM surfaces, capture preparation, page parsing, export preparation, and apply-back interaction. It does not call privileged browser APIs directly when a typed background route owns the operation.

Content UI treats the host page as untrusted input. DOM-derived payloads stay `unknown` until parsed, page events do not create privilege by themselves, and cleanup restores any page state changed for capture.

## Extension pages

- `apps/extension/src/popup/index.tsx` owns the popup shell and popup-scoped workflows.
- `apps/extension/src/settings/index.tsx` owns settings UI; persistence remains in its named composition owners.
- `apps/extension/src/gallery/index.tsx` owns saved-media browsing and gallery interaction.
- `apps/extension/src/design-system/index.tsx` owns the component and token preview catalog, not shared component implementation.
- `apps/extension/src/web-snapshot-viewer/index.tsx` owns read-only saved-page viewing.

Viewer preparation has one sanctioned one-way exception: `apps/extension/src/web-snapshot-viewer/preparation/**` may import `apps/extension/src/content/public/preparation-surface/**`. This does not make content a shared layer and does not permit reverse or unrelated content imports.

## Editing runtimes

- `apps/extension/src/editor/index.tsx` owns image workspace state, Fabric integration, editing commands, and editor persistence adapters. Its document-load path retains the owner-local legacy Fabric arrow-group compatibility backend.
- `apps/extension/src/video-editor/index.tsx` owns video workspace state, timeline editing, project persistence adapters, and the parent-side EffectV1 preview adapter.
- `apps/extension/src/video-editor/contracts/**` is the page-local exchange seam for cross-owner DTOs and command ports. It stays independent of React, Zustand, and video-editor product surfaces; `apps/extension/src/video-editor/runtime/controller/store.ts` is the sole runtime adapter from the full Zustand state to the explicit controller port.
- `apps/extension/src/scenario-editor/index.tsx` owns scenario authoring, presentation, and scenario-specific project adapters. Shared scenario contracts and projections remain under named app-core owners rather than direct editor imports.

Page-local workspace state is disposable or advisory until an explicit persistence owner commits it. A failed commit must remain visible to the editing surface.

## Camera recorder

`apps/extension/src/camera-recorder/index.tsx` is the camera-recorder page entrypoint. It owns camera preview and recorder-page UI, uses typed runtime routes for privileged coordination, and does not import sibling runtime implementations.

## Offscreen document

`apps/extension/src/offscreen/offscreen.html` and `apps/extension/src/offscreen/offscreen.ts` define the offscreen runtime. It owns approved media capture, recording, viewport, and export work delegated by the background service worker.

Offscreen commands accept only the verified background/offscreen channel and validate freshness, capability, and rate limits before parsing or mutating idempotency state. Side-effect commands key duplicate execution by authority generation and request, job, or recording identity.

## Effect runtime sandbox

`apps/extension/src/effect-runtime-sandbox/index.html` is the manifest-declared sandbox page for declarative EffectV1 frame evaluation. It has no extension API authority and is driven only by extension-owned parents through the validated effect-runtime protocol.

The parent resolves a content-addressed project snapshot, validates the EffectV1 document and retained assets, enforces raster/media budgets, and transfers only the required frame inputs. Its build-owned inline Worker independently parses a private request envelope from `unknown`, repeats protocol and budget validation, interprets the closed EffectV1 command/expression vocabulary, and closes after a bounded failure or typed result. The sandbox cannot execute imported source code, access the network or browser persistence, or create a second runtime authority. Timeout, malformed output, identity mismatch, unsupported command, or resource overflow fails the render request without fallback.

## State and egress

Capture/download job authority lives in `apps/extension/src/background/capture/jobs/state-machine.ts`; project-export ledger authority lives in `apps/extension/src/composition/persistence/export-ledger/index.ts`. Advisory runtime maps must remain tied to these durable or revisioned owners.

Content AI egress uses `apps/extension/src/features/ai/privacy/index.ts` for DOM privacy proof and the named content egress pipeline for sanitized payload construction. Secret handling, retention, diagnostics, and network-header rules remain governed by [data handling](../security/data-handling.md).

## Adding or changing a runtime

Update the runtime topology registry, manifest/build inputs, entrypoint ownership, documentation markers, and drift tests in one coherent change. A new privileged route also requires its contract parser, route owner, authorization policy, sender class, authority/freshness/replay behavior, failure response, and listener-path proof.
