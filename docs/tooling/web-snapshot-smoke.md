# Web Snapshot Smoke

This is a local visual-fidelity polygon. It is deliberately not part of QA or CI and does not keep copies or golden screenshots of third-party sites in the repository. Its single question is whether a saved Web Copy visually matches the live page after the same preparation.

## External-site polygon

Run the default catalog, one target, or the optional extended catalog:

```bash
npm run web-snapshot:smoke
npm run web-snapshot:smoke -- --target sap-ui5-cart
npm run web-snapshot:smoke -- --extended
```

Targets are declared in `tooling/web-snapshot-smoke/external-targets.mjs`. Each page is opened at a 1280×800 viewport, waits for its readiness selector and image decoding, receives two complete lazy-loading scroll passes, and must reach stable document dimensions. The tool then captures the live reference, creates a real Library Web Snapshot, opens it in the existing Viewer, and captures the comparison surface at the same viewport.

Regular DOM pages use the static Web Copy as visual authority. Canvas, WebGL, and PDF targets use the retained full-page screenshot. Screenshot comparisons normalize an intentional uniform downscale caused by the full-page quality policy, while recording both original dimensions and the scale in metrics. The temporary browser profile is pinned to the application's `maximum` quality profile (80 MP, 100% minimum scale, 128 MiB) so local user settings cannot make runs incomparable.

An unavailable page, server error, CAPTCHA/login wall, or missing readiness selector is reported as `SKIP`; a capture or Viewer failure after readiness is `FAIL`. Every completed comparison writes:

```text
.tmp/web-snapshot-smoke/results/<target>/
  source.png
  exported.png
  diff.png
  metrics.json
```

A target that cannot reach comparison still writes `metrics.json` with its `skipped` or `failed` status and concrete reason; unavailable image artifacts are not fabricated.

The default limits are 0.5% height drift, 5% changed pixels, mean channel delta 5, and 1% missing area. A descriptor may carry a proven site-specific tolerance, but the tool never maintains external golden images.

The older deterministic fixture workflow remains available for engine-focused diagnosis:

```bash
npm run web-snapshot:smoke -- --fixtures
```

## Deterministic fixture diagnostics

The same local tooling retains a separate fixture mode for complete save-and-view diagnostics. It is intentionally outside the application and the normal E2E suite. The runner builds the extension, loads a copy into a temporary Chromium profile, saves pages through the real extension runtime, and writes evidence to `.tmp/web-snapshot-smoke/results/`.

Run the deterministic fixture matrix:

```bash
npm run web-snapshot:smoke -- --fixtures
```

The default matrix contains deterministic pages for complex layout, open nested Shadow DOM, parser-unstable markup, sensitive-control masking, semicolons inside `@import` URLs, and sections revealed during full-page scrolling.

Use one named case while investigating:

```bash
SNAPSHOT_SMOKE_CASE=reveal-import-fixture npm run web-snapshot:smoke -- --fixtures
```

To verify a local HTML file, pass its path. The runner serves it from a temporary loopback origin and adds a required `local-html` case to the matrix:

```bash
SNAPSHOT_SMOKE_LOCAL_HTML=/path/to/page.html SNAPSHOT_SMOKE_CASE=local-html npm run web-snapshot:smoke -- --fixtures
```

To verify a live page without committing its address, pass `SNAPSHOT_SMOKE_URL` and select the `external-url` case. The address is used only for that local run and is not written to the tool sources.

Set `SNAPSHOT_SMOKE_POPUP_UI=1` to save through the visible popup flow and verify that the dialog fits, progress is observable during capture, and the completed action opens the viewer:

```bash
SNAPSHOT_SMOKE_POPUP_UI=1 SNAPSHOT_SMOKE_CASE=fixture npm run web-snapshot:smoke -- --fixtures
```

Set `SNAPSHOT_SMOKE_DOWNLOAD=1` to exercise the archive-download lifecycle instead of Library persistence. This mode verifies browser admission, terminal download state, offscreen lease release, and durable output cleanup without retaining the target URL in tooling sources:

```bash
SNAPSHOT_SMOKE_DOWNLOAD=1 SNAPSHOT_SMOKE_URL='https://target.example/page' SNAPSHOT_SMOKE_CASE=external-url npm run web-snapshot:smoke -- --fixtures
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
