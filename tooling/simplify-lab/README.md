# Simplify laboratory

This laboratory checks the current Simplify algorithms through the application Worker. It stores no reference images in Git. The website catalog remains separate from the Web Snapshot catalog because the tools test different behavior.

## Start the laboratory

Run these commands from the repository root:

```bash
npm run simplify:lab
npm run simplify:lab -- --target knowledge-wikipedia
npm run simplify:lab -- --port 0
```

The default address is `http://127.0.0.1:4179`. Port `0` selects an available port. The server accepts loopback connections only.

[`sites.json`](sites.json) owns the public URLs, readiness selectors, optional scroll destinations, and locale settings. The catalog covers stores, forms, tables, documentation, editors, Cyrillic text, and dark interfaces. The first capture occurs when you select a site. The server captures each selected site once per session. Restart the server to capture fresh pixels.

The capture uses a disposable Chromium context without your browser profile or extension. Public capture requires the Chromium OS sandbox. Capture fails if the operating system cannot provide that sandbox. Each source contains the visible viewport at 1280×560 CSS pixels and DPR 1. An optional scroll destination places the relevant example in that viewport. Capture output remains under `.tmp/simplify-lab-captures/`. The laboratory stores the URL, final URL, capture time, viewport, and DPR beside each screenshot.

The server accepts capture requests only for catalog identities through a same-origin JSON POST. It does not accept arbitrary URLs through HTTP. The browser upload control also accepts your own image. Uploaded images remain in that browser session unless you download a result.

## Check a result

1. Select a site or upload an image.
2. Specify the region in image pixels.
3. Select the automatic or manual mode.
4. Select the content, thickness, sensitivity, and color settings.
5. Select **Обработать** to process the region.
6. Compare the source and result.
7. Record your assessment of roles, object integrity, text residue, and style.
8. Download the PNG result or JSON report.

The interface uses Russian control labels. An assessment starts as **Не проверено**, which means unreviewed. A completed computation does not establish visual quality. Sources from live sites have no automatic role annotations.

Cancellation preserves the last accepted result. A different source clears the active result. A late response cannot replace a newer selection. If capture fails, select another site or upload an image.

## Run the browser check

```bash
npm run simplify:check
npm run simplify:check -- --target knowledge-wikipedia
npm run simplify:check -- --full
npm run simplify:check -- --out .tmp/simplify-custom-results
node --test tooling/simplify-lab/server.test.mjs tooling/simplify-lab/capture.test.mjs
```

The default browser check selects a small sample from the site catalog. `--full` checks every catalog entry. The matrix in [`run.mjs`](run.mjs) owns the parameter combinations. These combinations form a representative sample, not every possible parameter combination.

The browser check writes PNG results, JSON records, and interface screenshots under `.tmp/simplify-lab-results/`. It checks both primary viewports and the existing responsive breakpoints. Reports retain the source hash, capture provenance, source and bundle hashes, settings, region, algorithm version, and processing time. Automated results keep their visual assessments unreviewed.

An unavailable site, HTTP error, access wall, or missing readiness selector produces `SKIP`. A capture failure after readiness produces `FAIL`. A Worker or interface failure also produces `FAIL`. A run with no completed computation fails and retains its acquisition report. A run with skipped sites proves only the completed cases.

## Use a local corpus

You can explicitly select an external corpus instead of the public sites:

```bash
npm run simplify:lab -- --corpus /absolute/path/corpus.json
npm run simplify:check -- --corpus /absolute/path/corpus.json --full
```

The manifest contains `cases` with `id`, `path`, and SHA-256 `sourceHash`. The server checks each PNG and hash before it starts. Paths must remain within the parent of the manifest directory after symbolic links resolve. No local corpus loads automatically. Do not commit private images or reports.

## Check the application

The laboratory bundles the current `offscreen/simplify/worker.ts`, `offscreen/simplify/service.ts`, and `workflows/simplify/compute-client.ts` through the installed esbuild. The Worker runs outside the interface thread. Restart the server after source changes. This procedure checks computation, but it does not check background authorization in the extension.

Build the extension harness before the application check:

```bash
npm run qa:e2e:build
SNIPTALE_EXTENSION_BUILD_DIR=.tmp/e2e-builds/test npm exec playwright test -- tooling/test/e2e/extension-critical/extension-critical-simplify.spec.ts --workers=1
```

These scenarios check the editor, page drawing, crop selection, and recording at 1280×560 and 1920×900. The editor harness substitutes platform storage and save operations. Its computation requests reach the real extension. Other surfaces use the real extension capture routes and Worker.

The scenarios check background, text changes, resized bands, manual image symbols, flattened screenshots, and decoded recording pixels. Normal runs do not change the Worker or open diagnostic documents.

Set `SNIPTALE_SIMPLIFY_OBSERVE=1` only for coordinate diagnosis. The observer records Worker inputs and responses in the Playwright output directory. It does not change messages or record capabilities. Complete the final check without this diagnostic setting.

For snapshot fidelity and export checks, use the separate [Web Snapshot procedure](../../docs/tooling/web-snapshot-smoke.md).
