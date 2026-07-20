# Manifest permissions

Updated: 2026-07-14

This document explains high-impact grants and manifest topology. `tooling/configs/qa/manifest-permissions.data.json` is the complete hard-fail inventory for permissions, host permissions, content scripts, web-accessible resources, owners, routes, failure behavior, and review notes.

## High-impact boundaries

| Boundary | Grant/topology | Owner | Policy |
| --- | --- | --- | --- |
| Current-tab capture and page tooling | `activeTab`, `scripting` | capture editor, page-access service, browser scripting adapter | Current-tab authority only; inject the full content runtime through page access. |
| Persistent page tooling and visible capture | optional `<all_urls>` plus dynamic HTTP/HTTPS registration | page-access service, visible capture | User-approved optional access; compact shim registration only, full runtime remains lazy. |
| Extension pages | no host permission | extension page entrypoints | Settings, gallery, editors, popup, and snapshot viewer remain usable without host access. |
| Debugger-backed capture and diagnostics | `debugger` | debugger adapter, full-page capture, HAR collector | Feature-gated with explicit denial handling. |
| Tab recording | `tabCapture` | tab-capture adapter, capture mode | Required for tab and tab-crop recording modes. |
| Screen/window recording | `desktopCapture` | desktop-capture adapter and source picker | Background policy filters browser-selected sources. |
| Native companion | `nativeMessaging` | native adapter and background native-app owners | Channel/protocol/settings validation; browser-only behavior survives absence or denial. |
| Exports | `downloads` | downloads adapter and download owners | Leading optionalization candidate after every sink has request-before-use and failure UI. |
| Content runtime delivery | generated injected bundles, no source static content scripts | injected build and page-access owners | Shim may register dynamically; full runtime uses explicit scripting injection. |
| Content fonts | exact `fonts/manrope-*.woff2`, `use_dynamic_url: true` | manifest, public fonts, runtime styles, Vite | Only exact OFL-licensed font files are web-accessible; runtime JavaScript is not. |
| Web-snapshot runner | not web-accessible | injected build and background routing | Delivered only through scripting-owned execution. |
| Browser baseline | `minimum_chrome_version: "140"` | manifest and browser adapters | Lowering requires compatibility and owner proof. |
| Browser action | popup HTML and title | popup runtime | Privileged work routes through background owners. |
| Context menu | `contextMenus` | context-menu runtime | User entrypoint, not blanket authority; route policy still applies. |
| Offscreen media | `offscreen`, `USER_MEDIA` | video runtime and offscreen document | Recording/export only; reason and capability policy stay aligned. |
| Effect runtime | manifest sandbox page and sandbox CSP without dynamic-code permission | sandbox broker, preview, export | Persistent build-owned blob Worker; declarative interpreter only, private ports, typed envelopes, content hashes, no network/storage, bounded media and timeout termination. Request-owned bitmaps and the hydrated SVG/Path2D cache are released after every success or failure. |

## Reduction rules

1. Do not reintroduce required `<all_urls>` or a static all-frame source content script.
2. Dynamic registration follows optional host state; denial prevents registration and revocation removes owner-created registrations.
3. Capability gates live at the owning browser/runtime seam before any permission becomes optional.
4. Optionalize `downloads` only after all sinks have request and failure behavior; then evaluate `desktopCapture`, `tabCapture`, and debugger families independently.
5. Keep web-accessible resources exact. Never use `assets/*`, `fonts/*`, or expose injected runtime bundles.

## Review rule

A grant reduction ships with its owner-seam gate, user-visible denial/fallback behavior, and regression proof. Permission strings and manifest topology must remain synchronized with the hard-fail inventory.
