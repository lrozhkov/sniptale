# Repository overview

Sniptale is a TypeScript and React Manifest V3 Chromium extension built with Vite and CRXJS. This document maps top-level source ownership. [Code organization](code-organization.md) owns dependency and placement rules. [Shared topology](shared-topology.md) explains package and app-core residency.

## Product source map

- `apps/extension/src/background` contains the background runtime.
- `apps/extension/src/content` contains the content runtime.
- `apps/extension/src/camera-recorder`, `offscreen`, and `effect-runtime-sandbox` own isolated extension runtimes.
- `apps/extension/src/popup`, `settings`, `gallery`, `design-system`, and `web-snapshot-viewer` own extension pages.
- `apps/extension/src/editor`, `video-editor`, and `scenario-editor` own editing runtimes.
- [App-core roots](shared-topology.md#app-core-residency) contain extension-owned cross-runtime source.
- [Reusable packages](shared-topology.md#package-roles) contain dependency-closed cross-runtime source.

## Tooling source map

- `apps/extension/build` owns extension build inputs and layout.
- `apps/extension/public` contains copied static assets.
- `tooling/test` owns E2E tests, browser harnesses, fixtures, and shared test support.
- `tooling/qa` owns QA wrappers, guards, audits, and policy implementations.
- `tooling/configs` owns passive machine policy and baselines.
- `tooling/release` owns release packaging and artifact-security checks.
- `tooling/agent-tooling` owns deterministic archive creation, validation, installation, and removal for the optional agent kit.
- `tooling/backup` writes ignored local archives to `.backup/`.
- `.tmp` contains generated local reports and tooling artifacts.
- `tasks` contains unstaged task artifacts.

Use the [documentation index](../README.md) to find domain authorities.
