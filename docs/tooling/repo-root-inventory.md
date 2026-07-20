# Repo Root Inventory

Updated: 2026-07-14

The repository root contains only package entrypoints, externally auto-discovered configuration, canonical human guidance, and explicitly ignored workspace/build artifacts. Tooling implementation belongs under `tooling/**`; extension implementation/build inputs belong under `apps/extension/**`.

## Required Root Entries

- Package/dependency entrypoints: `package.json`, `package-lock.json`.
- Auto-discovered configuration: `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `eslint.config.js`, `playwright.config.ts`, `.dependency-cruiser.cjs`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.npmrc`.
- GitHub-owned configuration: `.github/workflows/**` and `.github/pull_request_template.md`.
- Human and contributor guidance: `AGENTS.md`, `DESIGN.md`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- Legal/release entrypoints: `LICENSE`, `NOTICE`, `LICENSES/**`, `THIRD_PARTY_DEPENDENCIES.json`, and `THIRD_PARTY_NOTICES.md`. These stay at the conventional root release boundary. `LICENSES/OFL-1.1.txt` is the canonical bundled Manrope license; the dependency generator verifies and references it without creating a versioned duplicate. Other `LICENSES/dependencies/**` files and the two third-party indexes are generator-owned.

Extension Vite/PostCSS/Tailwind configuration, manifest, public assets, and injected-bundle helpers live under `apps/extension/**`; root package scripts select the app configuration explicitly.

## Retired Roots

- `scripts/**`, root `tests/**`, root `test-support/**`, and `src/test-harness/**` are retired. Use `tooling/release/**`, `tooling/test/**`, `tooling/backup/**`, or `tooling/configs/**`.
- Root backup scripts are retired; use `npm run backup:repo` or `npm run backup:prod`.
- Root Vite/PostCSS/Tailwind configuration, `src/manifest.json`, `src/vite-env.d.ts`, and root `public/**` are retired; the extension app owns them.

## Ignored Workspace And Build Roots

Dependencies, root build/test output, caches, editor state, local environment files, and workspace tasks are ignored by `.gitignore`. The principal roots are `node_modules/**`, `dist/**`, `build/**`, `.tmp/**`, `.backup/**`, `.output/**`, `coverage/**`, `.playwright-browsers/**`, `playwright-report/**`, `test-results/**`, and root `/tasks/**`; tracked exceptions keep `tooling/build/**` and `apps/extension/build/**` in source. `tasks/**` must never be staged.

`.gitignore` is part of this topology contract. Before adding an ignored root, verify that the owner cannot use an existing ignored location and update this inventory together with the ignore rule. Before adding a tracked root, prove external auto-discovery or package semantics, update this inventory, and add only the narrow guardrail exception required by that proof.
