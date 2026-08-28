import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSmokeCaseVerifier } from './case-verification.mjs';

const ROOT = process.cwd();
const OUT = join(ROOT, '.tmp/web-snapshot-smoke/results');
const fixtureBytes = await readFile(join(ROOT, 'tooling/web-snapshot-smoke/fixtures/complex.html'));
const parserUnstableFixtureBytes = await readFile(
  join(ROOT, 'tooling/web-snapshot-smoke/fixtures/parser-unstable.html')
);
const revealImportFixtureBytes = await readFile(
  join(ROOT, 'tooling/web-snapshot-smoke/fixtures/reveal-import.html')
);
const localHtmlPath = process.env.SNAPSHOT_SMOKE_LOCAL_HTML
  ? resolve(ROOT, process.env.SNAPSHOT_SMOKE_LOCAL_HTML)
  : null;
const localHtmlBytes = localHtmlPath ? await readFile(localHtmlPath) : null;
const externalUrl = process.env.SNAPSHOT_SMOKE_URL?.trim() || null;
await mkdir(OUT, { recursive: true });

const fixtureResources = new Map([
  ['/root.css', ['text/css', '@import "/theme.css" screen;']],
  [
    '/theme.css',
    [
      'text/css',
      `.art {
        background-image: url("/fixture-mark.svg"),
          radial-gradient(circle at 30% 30%, #fef3c7 0 11%, transparent 12%),
          radial-gradient(circle at 68% 35%, #bfdbfe 0 18%, transparent 19%),
          conic-gradient(from 40deg, #312e81, #0891b2, #0f766e, #312e81);
        background-position: center;
        background-repeat: no-repeat;
        background-size: 96px, auto, auto, auto;
      }`,
    ],
  ],
  [
    '/reveal-theme.css?weights=400;600;700',
    [
      'text/css',
      `body { font-family: Arial, sans-serif; }
      .reveal-card {
        border-color: #2563eb;
        background-image: url("/fixture-mark.svg");
      }`,
    ],
  ],
  [
    '/fixture-mark.svg',
    [
      'image/svg+xml',
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
        '<circle cx="48" cy="48" r="42" fill="#fff" fill-opacity=".85"/>' +
        '<path d="M28 50l13 13 28-31" fill="none" stroke="#2563eb" stroke-width="9" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ],
  ],
]);
const server = createServer((request, response) => {
  if (request.url === '/parser-unstable') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(parserUnstableFixtureBytes);
    return;
  }
  if (request.url === '/reveal-import') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(revealImportFixtureBytes);
    return;
  }
  if (request.url === '/local-html' && localHtmlBytes) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(localHtmlBytes);
    return;
  }
  const resource = fixtureResources.get(request.url ?? '');
  if (resource) {
    response.writeHead(200, { 'content-type': resource[0] });
    response.end(resource[1]);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(fixtureBytes);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const fixtureUrl = `http://127.0.0.1:${address.port}/fixture`;
const parserUnstableFixtureUrl = `http://127.0.0.1:${address.port}/parser-unstable`;
const revealImportFixtureUrl = `http://127.0.0.1:${address.port}/reveal-import`;
const localHtmlUrl = `http://127.0.0.1:${address.port}/local-html`;

const cases = [
  { name: 'fixture', url: fixtureUrl, required: true },
  {
    name: 'parser-unstable-fixture',
    url: parserUnstableFixtureUrl,
    required: true,
  },
  {
    name: 'reveal-import-fixture',
    url: revealImportFixtureUrl,
    required: true,
  },
  ...(localHtmlBytes ? [{ name: 'local-html', url: localHtmlUrl, required: true }] : []),
  ...(externalUrl ? [{ name: 'external-url', url: externalUrl, required: true }] : []),
];
const selectedCases = process.env.SNAPSHOT_SMOKE_CASE
  ? cases.filter((item) => item.name === process.env.SNAPSHOT_SMOKE_CASE)
  : cases;
if (selectedCases.length === 0) {
  throw new Error(`Unknown SNAPSHOT_SMOKE_CASE: ${process.env.SNAPSHOT_SMOKE_CASE}`);
}

const userDataDir = await mkdtemp(join(tmpdir(), 'sniptale-web-snapshot-smoke-'));
const unpackedDir = await mkdtemp(join(tmpdir(), 'sniptale-web-snapshot-extension-'));
await cp(join(ROOT, 'dist'), unpackedDir, { recursive: true });
const manifestPath = join(unpackedDir, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), '<all_urls>'])];
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const context = await chromium.launchPersistentContext(userDataDir, {
  args: [
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--enable-unsafe-extension-debugging',
  ],
  channel: 'chromium',
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  viewport: { width: 392, height: 560 },
});

const backgroundConsoleWarnings = [];
const diagnosticConsoleMessages = [];
const observedServiceWorkers = new WeakSet();
const observeServiceWorker = (worker) => {
  if (observedServiceWorkers.has(worker)) return;
  observedServiceWorkers.add(worker);
  worker.on('console', (message) => {
    if (
      /\[(?:BackgroundFullPageCapture|BackgroundPagePackageDownload|BackgroundPagePackageJob|BackgroundWebSnapshotAssets)\]/.test(
        message.text()
      )
    ) {
      diagnosticConsoleMessages.push({
        context: 'service-worker',
        level: message.type(),
        text: message.text(),
      });
    }
    if (message.type() === 'warning' || message.type() === 'error') {
      backgroundConsoleWarnings.push({
        level: message.type(),
        text: message.text(),
      });
    }
  });
};
context.on('page', (page) => {
  page.on('console', (message) => {
    if (
      /\[(?:ContentFullPageCapture|ContentWebSnapshot|OffscreenDocument|OffscreenRuntime)\]/.test(
        message.text()
      )
    ) {
      diagnosticConsoleMessages.push({
        context: 'page',
        level: message.type(),
        text: message.text(),
      });
    }
  });
});
context.on('serviceworker', observeServiceWorker);
for (const worker of context.serviceWorkers()) observeServiceWorker(worker);

const report = {
  backgroundConsoleWarnings,
  diagnosticConsoleMessages,
  cases: [],
  generatedAt: new Date().toISOString(),
};
const popupUi = process.env.SNAPSHOT_SMOKE_POPUP_UI === '1';
const { enableWebSnapshotsForSmoke, verifyCase } = createSmokeCaseVerifier({
  context,
  out: OUT,
  popupUi,
});

try {
  const session = await context.browser().newBrowserCDPSession();
  const loaded = await session.send('Extensions.loadUnpacked', {
    path: unpackedDir,
  });
  await session.detach();
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 392, height: 560 });
  await popup.goto(`chrome-extension://${loaded.id}/apps/extension/src/popup/index.html`);
  await enableWebSnapshotsForSmoke(popup);
  for (const spec of selectedCases) {
    try {
      const result = await verifyCase(loaded.id, popup, spec);
      report.cases.push({ status: 'passed', ...result });
      process.stdout.write(`PASS ${spec.name} ${result.assetId}\n`);
    } catch (error) {
      report.cases.push({
        name: spec.name,
        status: 'failed',
        error: error instanceof Error ? error.stack : String(error),
      });
      process.stdout.write(
        `FAIL ${spec.name}: ${error instanceof Error ? error.message : String(error)}\n`
      );
      if (spec.required) throw error;
    }
  }
  await popup.close();
} finally {
  await writeFile(join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await context.close();
  server.close();
}

const passed = report.cases.filter((item) => item.status === 'passed');
const failures = [];
const rejectedBackgroundNoise = backgroundConsoleWarnings.filter(({ text }) =>
  /Rejected runtime message without a valid contract|Failed to disable preparation after navigation|Unauthorized content runtime wake-up sender/.test(
    text
  )
);
if (rejectedBackgroundNoise.length > 0) {
  failures.push(
    `Background emitted known export warning noise: ${JSON.stringify(rejectedBackgroundNoise)}`
  );
}
const requireCase = (condition, item, message) => {
  if (!condition) failures.push(`${item.name}: ${message}`);
};
if (passed.length < selectedCases.length) {
  failures.push(`Only ${passed.length}/${selectedCases.length} selected cases completed`);
}
for (const item of passed) {
  if (item.downloadProof) {
    requireCase(Boolean(item.downloadProof.filename), item, 'download did not publish a filename');
    continue;
  }
  const postCaptureSourceInfo = item.sourceAfterFullScreenshotInfo ?? item.sourceInfo;
  requireCase(
    item.visualInfo.naturalWidth > 0 && item.visualInfo.naturalHeight > 0,
    item,
    'retained screenshot did not decode'
  );
  requireCase(
    item.visualSignal.opaquePixels === 4096 && item.visualSignal.coarseColorCount >= 8,
    item,
    'retained screenshot is visually empty'
  );
  requireCase(
    item.thumbnailInfo.naturalWidth === 320 && item.thumbnailInfo.naturalHeight === 180,
    item,
    'gallery thumbnail is missing or has the wrong size'
  );
  requireCase(
    item.previewInfo.naturalWidth === item.visualInfo.naturalWidth &&
      item.previewInfo.naturalHeight === item.visualInfo.naturalHeight,
    item,
    'gallery preview does not use the full retained screenshot'
  );
  requireCase(
    item.visualInfo.renderedWidth <= item.visualInfo.naturalWidth &&
      item.visualInfo.renderedHeight <= item.visualInfo.naturalHeight,
    item,
    'viewer screenshot is enlarged beyond its natural dimensions'
  );
  requireCase(
    item.staticInfo.scriptCount === 0 && item.staticInfo.hasBody,
    item,
    'static document is missing or retains scripts'
  );
  requireCase(item.defaultStaticVisible, item, 'static document is not the default viewer surface');
  requireCase(item.assetCatalogInfo.cards >= 1, item, 'asset catalog is empty');
  requireCase(
    item.viewerExternalRequests.length === 0,
    item,
    'viewer made external network requests'
  );
  const heightDelta = Math.abs(
    item.staticInfo.documentHeight - postCaptureSourceInfo.documentHeight
  );
  requireCase(
    heightDelta <= Math.max(2, postCaptureSourceInfo.documentHeight * 0.005),
    item,
    'static document height drifted beyond 0.5%'
  );
  requireCase(
    item.viewportPixel.changedPixelRatio <= 0.08 &&
      item.viewportPixel.meanAbsoluteChannelDelta <= 4,
    item,
    'static viewport exceeds the bounded pixel or channel-delta threshold'
  );
  requireCase(
    item.fullPagePixel.changedPixelRatio <= 0.02,
    item,
    'static document differs from retained capture by more than 2% of pixels'
  );
  requireCase(
    item.sourceFullPagePixel.changedPixelRatio <= 0.05,
    item,
    'retained capture differs from the live page by more than 5% of pixels'
  );
  requireCase(
    item.staticInfo.elementCount >= postCaptureSourceInfo.elementCount * 0.85,
    item,
    'static document lost too many elements'
  );
  requireCase(
    item.staticInfo.textLength >= postCaptureSourceInfo.textLength * 0.95,
    item,
    'static document lost too much visible text'
  );
  requireCase(
    item.staticInfo.loadedImages >= postCaptureSourceInfo.loadedImages * 0.9,
    item,
    'static document lost too many loaded images'
  );
  if (item.name === 'fixture') {
    requireCase(
      item.externalLinkProof?.executableHref === null &&
        item.externalLinkProof.projectedHref === item.externalLinkProof.openedUrl,
      item,
      'safe external link did not remain inert or open in a separate live tab'
    );
    requireCase(
      Boolean(item.sourceInfo.inlineMaskImage && item.sourceInfo.inlineMaskImage !== 'none') &&
        Boolean(item.staticInfo.inlineMaskImage && item.staticInfo.inlineMaskImage !== 'none'),
      item,
      'captured inline SVG CSS mask was lost from the static document'
    );
    requireCase(
      Boolean(item.sourceInfo.escapedMaskImage && item.sourceInfo.escapedMaskImage !== 'none') &&
        Boolean(item.staticInfo.escapedMaskImage && item.staticInfo.escapedMaskImage !== 'none'),
      item,
      'captured CSS-escaped utf8 SVG mask was lost from the static document'
    );
    requireCase(
      postCaptureSourceInfo.dynamicPanelExpanded === true &&
        item.staticInfo.dynamicPanelExpanded === true,
      item,
      'dynamic layout growth was not retained after capture-plan stabilization'
    );
    requireCase(
      item.staticInfo.shadowCard?.display === 'block' &&
        item.staticInfo.shadowCard.nestedImageWidth > 0 &&
        item.staticInfo.shadowCard.nestedInputValue === 'current nested value' &&
        item.staticInfo.shadowCard.nestedText.includes('Nested shadow asset'),
      item,
      'open nested Shadow DOM was not retained'
    );
    requireCase(
      item.sourceInfo.sensitiveProof?.backgroundColor === 'rgb(255, 0, 0)' &&
        item.retainedSensitivePixel?.red <= 100,
      item,
      'sensitive-control masking was not retained in the screenshot'
    );
  }
  if (item.name === 'reveal-import-fixture' || item.name === 'local-html') {
    requireCase(
      item.staticInfo.revealedSectionCount ===
        item.sourceAfterFullScreenshotInfo.revealedSectionCount,
      item,
      'static document lost sections revealed during full-page capture'
    );
    requireCase(
      !item.staticInfo.capturedStyleHasImportTail,
      item,
      'captured CSS contains a truncated @import tail'
    );
  }
  if (popupUi) {
    const popupProof = item.popupProof;
    requireCase(
      Boolean(popupProof?.selectionCurtainGeometry) &&
        popupProof.selectionCurtainGeometry.top >= 0 &&
        popupProof.selectionCurtainGeometry.bottom <=
          popupProof.selectionCurtainGeometry.viewportHeight,
      item,
      'Package Contents curtain does not fit its viewport'
    );
    requireCase(
      popupProof?.selectionCurtainGeometry.buttons.some(
        (button) =>
          /Back|Назад/i.test(`${button.text} ${button.ariaLabel}`) &&
          button.bottom <= popupProof.selectionCurtainGeometry.viewportHeight
      ),
      item,
      'Package Contents curtain back action is outside the viewport'
    );
    const progressObservations = popupProof?.progressObservations ?? [];
    requireCase(
      progressObservations.some((observation) =>
        observation.steps?.some((step) => step.status === 'active')
      ),
      item,
      'popup did not expose in-progress capture updates'
    );
    const progressRank = { pending: 0, active: 1, done: 2, error: 2 };
    const latestProgressRank = new Map();
    let progressRegressed = false;
    for (const observation of progressObservations) {
      for (const step of observation.steps ?? []) {
        const rank = progressRank[step.status];
        if (rank === undefined) continue;
        const previousRank = latestProgressRank.get(step.key) ?? -1;
        if (rank < previousRank) progressRegressed = true;
        latestProgressRank.set(step.key, Math.max(previousRank, rank));
      }
    }
    requireCase(!progressRegressed, item, 'popup replayed an already completed progress step');
    requireCase(
      /Open Web Snapshot|Открыть веб-снимок/i.test(popupProof?.resultTitle ?? ''),
      item,
      'popup did not expose the snapshot result action'
    );
  }
}
if (failures.length > 0) {
  process.stderr.write(`${failures.map((failure) => `FAIL ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Web Snapshot Smoke passed ${passed.length}/${selectedCases.length} cases. Report: ${join(OUT, 'report.json')}\n`
  );
}
