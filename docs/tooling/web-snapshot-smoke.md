# Web Snapshot Smoke

Web Snapshot Smoke is a standalone local verification tool for the complete save-and-view workflow. It is intentionally outside the application and the normal E2E suite. The runner builds the extension, loads a copy into a temporary Chromium profile, saves pages through the real extension runtime, and writes evidence to `.tmp/web-snapshot-smoke/results/`.

Run the default matrix:

```bash
npm run web-snapshot:smoke
```

The default matrix contains deterministic pages for complex layout, open nested Shadow DOM, parser-unstable markup, sensitive-control masking, semicolons inside `@import` URLs, and sections revealed during full-page scrolling.

Use one named case while investigating:

```bash
SNAPSHOT_SMOKE_CASE=reveal-import-fixture npm run web-snapshot:smoke
```

To verify a local HTML file, pass its path. The runner serves it from a temporary loopback origin and adds a required `local-html` case to the matrix:

```bash
SNAPSHOT_SMOKE_LOCAL_HTML=/path/to/page.html SNAPSHOT_SMOKE_CASE=local-html npm run web-snapshot:smoke
```

To verify a live page without committing its address, pass `SNAPSHOT_SMOKE_URL` and select the `external-url` case. The address is used only for that local run and is not written to the tool sources.

Set `SNAPSHOT_SMOKE_POPUP_UI=1` to save through the visible popup flow and verify that the dialog fits, progress is observable during capture, and the completed action opens the viewer:

```bash
SNAPSHOT_SMOKE_POPUP_UI=1 SNAPSHOT_SMOKE_CASE=fixture npm run web-snapshot:smoke
```

Set `SNAPSHOT_SMOKE_DOWNLOAD=1` to exercise the archive-download lifecycle instead of Library persistence. This mode verifies browser admission, terminal download state, offscreen lease release, and durable output cleanup without retaining the target URL in tooling sources:

```bash
SNAPSHOT_SMOKE_DOWNLOAD=1 SNAPSHOT_SMOKE_URL='https://target.example/page' SNAPSHOT_SMOKE_CASE=external-url npm run web-snapshot:smoke
```

Set `SNAPSHOT_SMOKE_RICH_PACKAGE=1` to select the full data-and-files profile. Set `SNAPSHOT_SMOKE_TIMEOUT_MS` to at least `10000` when a live page needs a larger bounded completion window; timeout failures include the last durable phase, progress payload, and revision.

The report records source, retained screenshot, static document, gallery, asset-catalog, and popup observations. The command fails when the static document loses too much layout, text, imagery, or height; when visual pixel drift crosses the bounded thresholds; when the retained screenshot or its 320×180 top-crop thumbnail is unavailable; when the viewer performs an external request; when scripts survive in the static document; or when the reveal/import regression reappears. PNG evidence and `report.json` remain local and ignored by Git.

The runner enables Web Snapshots and both resource-download options only inside its temporary extension profile. It also adds `<all_urls>` only to a temporary copy of the built manifest so the matrix can exercise arbitrary origins; it does not change the product manifest or a user profile.

Install the repo-local Playwright browser first if Chromium is unavailable:

```bash
npm run qa:e2e:install
npm run qa:e2e:install:deps
```

This smoke is strong acceptance evidence, not a promise that every possible page can be reproduced perfectly. Closed Shadow DOM, inaccessible cross-origin frames, DRM/canvas/video state, unavailable authenticated resources, and resources disabled by the user remain explicit fidelity ceilings. The retained screenshot is the visual authority for those cases; the static document remains inert, offline, and sanitized.
