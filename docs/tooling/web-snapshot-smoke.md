# Web Snapshot smoke

This document owns the local Web Snapshot visual-fidelity procedure. The smoke is outside QA and CI. It stores no external-site golden images.

The command builds the extension before running. It does not typecheck. Use the [operator handbook](operator-handbook.md) for canonical QA and build commands.

## External targets

Run the default catalog, one target, or the extended catalog:

```bash
npm run web-snapshot:smoke
npm run web-snapshot:smoke -- --target <target-id>
npm run web-snapshot:smoke -- --extended
```

[`external-targets.mjs`](../../tooling/web-snapshot-smoke/support/external-targets.mjs) owns target URLs, readiness selectors, comparison modes, and tolerances. The runner owns viewport, capture profile, preparation, and output layout. Do not copy those values into documentation.

Each ready target is captured live, saved through the extension, opened in the Viewer, and compared after the same page preparation. Static Web Copy is the authority for DOM pages. The retained screenshot is the authority for canvas, WebGL, and PDF targets.

An unavailable page, server error, login or CAPTCHA wall, or missing readiness selector is `SKIP`. A capture, Viewer, diagnostic, or comparison failure after readiness is `FAIL`.

Results are written under `.tmp/web-snapshot-smoke/results/`. Each attempted target has `metrics.json`; completed comparisons also include source, exported, diff, and diagnostic evidence. The result root is replaced at the start of a run.

## Deterministic fixtures

Run all fixtures or one named case:

```bash
npm run web-snapshot:smoke -- --fixtures
SNAPSHOT_SMOKE_CASE=<case-name> npm run web-snapshot:smoke -- --fixtures
```

Fixture descriptors in [`runner.mjs`](../../tooling/web-snapshot-smoke/runtime/runner.mjs) own the case inventory. Fixture assertions own accepted layout, content, security, Viewer, gallery, screenshot, and diagnostic behavior.

Add a local HTML page to the matrix:

```bash
SNAPSHOT_SMOKE_LOCAL_HTML=/absolute/page.html SNAPSHOT_SMOKE_CASE=local-html npm run web-snapshot:smoke -- --fixtures
```

Test a live URL without committing it:

```bash
SNAPSHOT_SMOKE_URL='https://example.test/page' SNAPSHOT_SMOKE_CASE=external-url npm run web-snapshot:smoke -- --fixtures
```

Optional fixture controls are:

- `SNAPSHOT_SMOKE_POPUP_UI=1` to save through the visible popup and verify progress and Viewer navigation
- `SNAPSHOT_SMOKE_DOWNLOAD=1` to verify archive download, terminal state, lease release, and durable cleanup
- `SNAPSHOT_SMOKE_RICH_PACKAGE=1` to use the full data-and-files profile
- `SNAPSHOT_SMOKE_TIMEOUT_MS=<milliseconds>` to replace the fixture completion timeout when the value is an integer of at least `10000`

## Snapshot print

Run the Viewer print path against a saved Page Package:

```bash
npm run web-snapshot:smoke -- --print-package /absolute/snapshot.sniptale-page-package.zip
npm run web-snapshot:smoke -- --print-url https://example.test/application
```

The package smoke serves the saved inert Web copy and captures it into Library again so old package profiles remain usable without weakening import policy. The URL smoke captures the live page. Both open the real Viewer, prepare its disposable print projection, and write `screen.png`, `print.png`, portrait and landscape A4 PDFs, and `metrics.json` under `.tmp/web-snapshot-smoke/results/print-package/`. It fails when an internal scroll region remains clipped, the projected document misses required content height, most source text disappears, or layout expansion creates implausible blank space.

Fixture output is bound to the built `dist` bytes and selected case set. Temporary browser profiles and extension copies are removed after success or failure. A temporary manifest copy receives the permissions needed for arbitrary test origins; the product manifest and user profiles are unchanged.

Install Chromium and its Linux dependencies through the [WSL browser prerequisites](wsl-setup.md#browser-smoke-prerequisites) when the repository browser is unavailable.

The smoke proves only its selected targets and fixtures. Closed Shadow DOM, inaccessible cross-origin frames, DRM, live canvas or video state, unavailable authenticated resources, and user-disabled resources remain fidelity limits. Exported static documents must remain inert, offline, and sanitized.
