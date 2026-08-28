# Manifest permissions

Updated: 2026-08-14

This document explains high-impact grants and manifest topology. `tooling/configs/qa/manifest-permissions.data.json` is the complete hard-fail inventory for permissions, host permissions, content scripts, web-accessible resources, owners, routes, failure behavior, and review notes.

## High-impact boundaries

| Boundary | Grant/topology | Owner | Policy |
| --- | --- | --- | --- |
| Current-tab capture and page tooling | `activeTab`, `scripting` | capture editor, page-access service, browser scripting adapter | Current-tab authority only; inject the full content runtime through page access. |
| Persistent page tooling and visible capture | optional `<all_urls>` plus dynamic HTTP/HTTPS registration | page-access service, visible capture | User-approved optional access; compact shim registration only, full runtime remains lazy. |
| Local-file page tooling | dedicated Settings opt-in, optional `file:///`, and Chrome's separate file-URL access setting | page-access service, Settings permissions | The browser switch is enabled before the runtime request; separate dynamic file registration is removed when the product opt-in is revoked. |
| Extension pages | no host permission | extension page entrypoints | Settings, gallery, editors, popup, and snapshot viewer remain usable without host access. |
| Browser-window size presets | `system.display` | display adapter and capture-surface owner | Read display bounds and work areas only; presets that do not fit are disabled, and display settings are never changed. |
| Tab recording | `tabCapture` | tab-capture adapter, capture mode | Required for tab and tab-crop recording modes. |
| Screen/window recording and one-shot screenshots | `desktopCapture` | desktop-capture adapter and source picker | Background policy filters browser-selected sources. Screenshot quick actions expose only `window` and `screen`, prepare offscreen before selection, and consume the one-shot stream ID immediately. |
| Native companion | optional `nativeMessaging` | Settings grant UI, native adapter, background permission lifecycle, and native-app owners | No native connection or controls before a user grant; revocation disconnects the active port. Channel/protocol/settings validation remains mandatory after grant, and browser-only behavior survives absence or denial. |
| Exports | `downloads` | downloads adapter and download owners | Leading optionalization candidate after every sink has request-before-use and failure UI. |
| Content runtime delivery | generated injected bundles, no source static content scripts | injected build and page-access owners | Shim may register dynamically; full runtime uses explicit scripting injection. |
| Content fonts | exact `fonts/manrope-*.woff2`, `use_dynamic_url: true` | manifest, public fonts, runtime styles, Vite | Only exact OFL-licensed font files are web-accessible; runtime JavaScript is not. |
| Web-copy production | no runtime bundle is web-accessible | content runtime, page-access service, and background routing | Runs only inside the scripting-delivered content runtime; Page Package staging remains sender- and active-job-bound. |
| Browser baseline | Manifest-owned minimum Chrome version and JSON-safe bounded or content-addressed extension messaging | manifest, runtime-message contracts, tab-capture output, and browser adapters | The current version is generated in [project facts](../engineering/project-facts.md); lowering it or opting into a different global message serializer requires compatibility and owner proof. |
| Browser action | popup HTML and title | popup runtime | Privileged work routes through background owners. |
| Context menu | `contextMenus` | context-menu runtime | User entrypoint, not blanket authority; route policy still applies. |
| Offscreen media, clipboard, and voice input | `offscreen`, `USER_MEDIA`, `CLIPBOARD` | shared offscreen-document lifecycle, video runtime, desktop-frame runtime, and voice-input runtime | Video recording, one-shot desktop screenshots, and voice-recognition sessions share one offscreen media lease. Desktop screenshot clipboard delivery accepts PNG only. The Settings test consumer has a 30-second session deadline; authorized content consumers remain active until their owner explicitly stops or disconnects. Microphone access is requested only by an explicit trusted action in visible extension-owned UI, either an extension page or an authorized top-level content overlay; signed commands, exact sender and single-owner Port policy, freshness, and runtime capability checks remain aligned. |
| Effect runtime | manifest sandbox page and sandbox CSP without dynamic-code permission | sandbox broker, preview, export | Persistent build-owned blob Worker; declarative interpreter only, private ports, typed envelopes, content hashes, no network/storage, bounded media and timeout termination. Request-owned bitmaps and the hydrated SVG/Path2D cache are released after every success or failure. |

## Reduction rules

1. Do not reintroduce required `<all_urls>` or a static all-frame source content script.
2. Dynamic registration follows optional host state; denial prevents registration and revocation removes owner-created registrations.
3. Local-file access additionally follows `extension.isAllowedFileSchemeAccess()`; an optional origin grant alone is not effective authority.
4. Capability gates live at the owning browser/runtime seam before any permission becomes optional.
5. Optionalize `downloads` only after all sinks have request and failure behavior; then evaluate `desktopCapture` and `tabCapture` independently.
6. Keep web-accessible resources exact. Never use `assets/*`, `fonts/*`, or expose injected runtime bundles.
7. Keep the local-file permission scope as Chrome's special `file:///` grant, but use the origin-only `file:///*` match required by `web_accessible_resources`.
8. Native Messaging remains optional. Background connection and mutation owners must verify the live grant, and permission removal must disconnect the native port before further native work.

## Review rule

A grant reduction ships with its owner-seam gate, user-visible denial/fallback behavior, and regression proof. Permission strings and manifest topology must remain synchronized with the hard-fail inventory.
