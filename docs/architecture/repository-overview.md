# Repository overview

Sniptale is a TypeScript and React Manifest V3 Chromium extension built with Vite and CRXJS. This document is the canonical source map; ownership rules live in [code organization](code-organization.md) and exact package/app-core classification lives in [shared topology](shared-topology.md).

## Product source map

- `apps/extension/src/background` owns the service worker, privileged browser APIs, authorization, routing, capture, recording, and background lifecycle state.
- `apps/extension/src/content` owns page overlays, DOM interaction, capture preparation, parsing, export preparation, and apply-back behavior.
- `apps/extension/src/camera-recorder` owns the isolated camera recorder page.
- `apps/extension/src/offscreen` owns media and export work that cannot run in the service worker.
- `apps/extension/src/effect-runtime-sandbox` owns isolated interpretation of validated declarative EffectV1 documents.
- `apps/extension/src/popup`, `settings`, `gallery`, `design-system`, and `web-snapshot-viewer` own extension pages.
- `apps/extension/src/editor`, `video-editor`, and `scenario-editor` own editing runtimes.
- `apps/extension/src/contracts`, `features`, `foundation`, `platform`, `ui`, `workflows`, and `composition` are app-core owners shared by extension runtimes.
- `packages/foundation`, `packages/runtime-contracts`, `packages/platform`, and `packages/ui` are dependency-closed reusable packages.

## Build, test, and policy map

- `apps/extension/build` owns Vite inputs, injected-bundle helpers, and extension build layout.
- `apps/extension/public` contains static assets copied into the extension artifact.
- `tooling/test` contains E2E tests, browser harnesses, fixtures, and shared test support.
- `tooling/qa` contains QA wrappers, deterministic guards, audits, and policy implementations.
- `tooling/configs` contains passive machine-readable policy and baselines.
- `tooling/release` owns release packaging and artifact-security tooling.
- `tooling/backup` writes local archives under ignored `.backup/`.
- `.tmp` contains generated local reports and tooling artifacts.
- `tasks` contains workspace-only task artifacts and is not staged.

## Architecture routes

- [Runtime contexts](runtime-contexts.md) owns runtime entrypoints, trust boundaries, and cross-runtime coordination.
- [Code organization](code-organization.md) owns folder roles, dependency direction, naming, and split rules.
- [Shared topology](shared-topology.md) explains package and app-core residency.
- [Storage state authority](storage-state-authority.md) owns durable, session, advisory, and disposable state invariants.
- [Parser architecture](parser-architecture.md) owns snapshot, parsing, projection, diagnostics, and apply-back flow.
- [i18n architecture](i18n-architecture.md) owns locale registry, messages, formatting, and adoption.
- [EffectV1 bundles](video-effect-bundles.md) owns the imported effect contract.
- [DESIGN.md](../../DESIGN.md) owns product UX, accessibility, theme, and interaction requirements.

Implementation workflow and proof rules live in [AGENTS.md](../../AGENTS.md) and [implementation rules](../engineering/implementation-rules.md). Security boundaries live in [data handling](../security/data-handling.md), [manifest permissions](../security/manifest-permissions.md), and the [threat model](../security/threat-model.md).
