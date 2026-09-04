# Repository root policy

This document owns the reasons a file may live at the repository root. Current entries come from the Git tree, not from a prose inventory.

## Tracked entries

A tracked root entry must be one of:

- a package-manager or workspace entrypoint
- configuration auto-discovered by Git, GitHub, an editor, or a repository tool
- project, contribution, security, or legal guidance conventionally discovered at the root
- a legal or release artifact whose archive path is defined by machine policy

Tooling implementation belongs under `tooling/**`. Extension implementation, configuration, manifest data, public assets, and build inputs belong under `apps/extension/**`. Workspace package implementation belongs under `packages/**`.

[`package.json`](../../package.json) owns root commands. [`.gitignore`](../../.gitignore) owns ignored paths. [`target-only-paths.data.json`](../../tooling/configs/qa/target-only-paths.data.json) and the extension build-layout policy own retired and app-local path enforcement. Generated [project facts](../engineering/project-facts.md) owns changing topology values.

Do not reintroduce root implementation under `src/**`, `scripts/**`, `tests/**`, `test-support/**`, or `public/**`. Do not add root Vite, PostCSS, Tailwind, manifest, or extension environment files.

Keep conventional license and notice files at the root release boundary. Keep bundled license texts under `LICENSES/**`. Modify generated dependency notices only through their generator.

## Ignored entries

Dependencies, build output, test output, caches, local environment state, optional agent copies, and task artifacts must remain ignored. Tracked build-policy sources under `tooling/build/**` and `apps/extension/build/**` are not output directories.

Before adding a tracked root entry, prove which external discovery or package rule requires that location. Before adding an ignored root, prove that no existing ignored owner fits the artifact. Update the owning machine policy and this rationale in the same change.
