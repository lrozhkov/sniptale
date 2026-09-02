import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import JSZip from 'jszip';
import { chromium } from 'playwright';
import { captureSmokeSource } from '../support/source-capture.mjs';
import { enableWebSnapshotsForSmoke } from './popup-driver.mjs';

const MAX_PRINT_HEIGHT_EXPANSION_RATIO = 2;

function fingerprintBody(body) {
  const document = body.ownerDocument;
  const round = (value) => Math.round(value * 10) / 10;
  const elements = [];
  const shadowText = [];
  const visit = (root) => {
    for (const element of root.children) {
      elements.push(element);
      if (element.shadowRoot) {
        shadowText.push(element.shadowRoot.textContent ?? '');
        visit(element.shadowRoot);
      }
      visit(element);
    }
  };
  visit(body);
  return {
    documentHeight: document.documentElement.scrollHeight,
    textLength: `${body.innerText}\n${shadowText.join('\n')}`.trim().length,
    elements: elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = globalThis.getComputedStyle(element);
      let hiddenByAncestor = false;
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const ancestorStyle = globalThis.getComputedStyle(ancestor);
        if (ancestorStyle.display === 'none' || ancestorStyle.visibility === 'hidden') {
          hiddenByAncestor = true;
          break;
        }
      }
      return {
        clientHeight: element.clientHeight,
        className: typeof element.className === 'string' ? element.className : '',
        display: style.display,
        height: round(rect.height),
        hiddenByAncestor,
        id: element.id,
        overflowY: style.overflowY,
        position: style.position,
        scrollHeight: element.scrollHeight,
        style: element.getAttribute('style') ?? '',
        tag: element.tagName,
        width: round(rect.width),
        x: round(rect.x),
        y: round(rect.y),
      };
    }),
  };
}

export function compareLayoutFingerprints(screen, print) {
  const comparedElements = Math.max(screen.elements.length, print.elements.length);
  let mismatchedElements = 0;
  for (let index = 0; index < comparedElements; index += 1) {
    if (JSON.stringify(screen.elements[index]) !== JSON.stringify(print.elements[index])) {
      mismatchedElements += 1;
    }
  }
  const heightDriftRatio =
    Math.abs(print.documentHeight - screen.documentHeight) / Math.max(1, screen.documentHeight);
  return {
    comparedElements,
    heightDriftRatio,
    mismatchedElements,
    mismatchRatio: mismatchedElements / Math.max(1, comparedElements),
  };
}

export function verifyPrintCoverage(screen, print) {
  const scrollRegions = [];
  for (let index = 0; index < screen.elements.length; index += 1) {
    const source = screen.elements[index];
    if (
      !source ||
      !['auto', 'scroll'].includes(source.overflowY) ||
      source.scrollHeight <= source.clientHeight + 1
    ) {
      continue;
    }
    const projected = print.elements[index];
    const hidden =
      Boolean(projected) && (projected.display === 'none' || projected.hiddenByAncestor === true);
    scrollRegions.push({
      expanded:
        hidden ||
        (Boolean(projected) &&
          projected.overflowY === 'visible' &&
          projected.height >= source.scrollHeight - 1),
      hidden,
      index,
      projectedHeight: projected?.height ?? null,
      sourceScrollHeight: source.scrollHeight,
    });
  }
  const requiredDocumentHeight = Math.max(
    1,
    ...scrollRegions
      .filter((region) => !region.hidden)
      .map((region) => {
        const projected = print.elements[region.index];
        return Math.max(0, projected?.y ?? 0) + region.sourceScrollHeight;
      })
  );
  return {
    documentHeightCoverage: print.documentHeight / Math.max(1, requiredDocumentHeight),
    documentHeightExpansionRatio:
      print.documentHeight / Math.max(1, screen.documentHeight, requiredDocumentHeight),
    requiredDocumentHeight,
    scrollRegions,
    textRetentionRatio: print.textLength / Math.max(1, screen.textLength),
    unexpandedScrollRegions: scrollRegions.filter((region) => !region.expanded),
  };
}

async function loadUnpackedExtension(context, unpackedDir) {
  const session = await context.browser().newBrowserCDPSession();
  try {
    return await session.send('Extensions.loadUnpacked', { path: unpackedDir });
  } finally {
    await session.detach();
  }
}

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

async function servePackageWebCopy(packagePath) {
  const archive = await JSZip.loadAsync(await readFile(packagePath));
  if (!archive.file('snapshot/index.html')) {
    throw new Error('Print package does not contain snapshot/index.html.');
  }
  const resources = new Map(
    await Promise.all(
      Object.entries(archive.files)
        .filter(([, entry]) => !entry.dir)
        .map(async ([path, entry]) => {
          const bytes = await entry.async('nodebuffer');
          if (path !== 'snapshot/index.html') return [path, bytes];
          return [
            path,
            Buffer.from(
              bytes
                .toString('utf8')
                .replace(/(<html\b[^>]*?)\sxmlns=(['"])http:\/\/www\.w3\.org\/1999\/xhtml\2/i, '$1')
            ),
          ];
        })
    )
  );
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const path =
      decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'snapshot/index.html';
    const bytes = resources.get(path);
    if (!bytes) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Length': bytes.byteLength,
      'Content-Type': CONTENT_TYPES.get(extname(path).toLowerCase()) ?? 'application/octet-stream',
    });
    response.end(bytes);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Print package server did not start.');
  return {
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
    url: `http://127.0.0.1:${address.port}/snapshot/index.html`,
  };
}

async function captureSource(context, extensionId, sourceUrl, outputRoot, options = {}) {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 392, height: 560 });
  await popup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  await enableWebSnapshotsForSmoke(popup);
  let captured;
  try {
    captured = await captureSmokeSource({
      context,
      out: outputRoot,
      popup,
      popupUi: false,
      spec: {
        name: 'print-source',
        navigationWaitUntil: options.navigationWaitUntil,
        settleDelayMs: options.settleDelayMs,
        url: sourceUrl,
      },
      state: { selectionCurtainGeometry: null },
    });
  } finally {
    await popup.close();
  }
  await captured.target.close();
  const viewer = await context.newPage();
  await viewer.goto(
    `chrome-extension://${extensionId}/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=${encodeURIComponent(captured.saved.assetId)}`
  );
  await viewer.waitForLoadState('domcontentloaded');
  return viewer;
}

async function capturePackage(context, extensionId, packagePath, outputRoot) {
  const source = await servePackageWebCopy(packagePath);
  try {
    return await captureSource(context, extensionId, source.url, outputRoot);
  } finally {
    await source.close();
  }
}

async function findRetainedPrintFrame(viewer) {
  await viewer.locator('iframe[data-sniptale-smoke-print-projection="true"]').waitFor({
    state: 'attached',
    timeout: 30_000,
  });
  for (const frame of viewer.frames()) {
    if (frame === viewer.mainFrame()) continue;
    if (await frame.evaluate(() => globalThis.__sniptaleSmokePrintRequested === true)) {
      return frame;
    }
  }
  throw new Error('Web Snapshot print projection frame was not retained.');
}

async function exercisePrintProjection(viewer, outputRoot) {
  const snapshotFrame = viewer.locator('iframe[title]').contentFrame();
  const snapshotRoot = snapshotFrame.locator('html');
  await snapshotRoot.waitFor({ state: 'attached' });
  await snapshotFrame.locator('body').evaluate(async (body) => {
    await body.ownerDocument.fonts?.ready;
  });
  const screen = await snapshotFrame.locator('body').evaluate(fingerprintBody);
  await snapshotRoot.screenshot({ path: join(outputRoot, 'screen.png') });

  await viewer.getByRole('button', { name: /Export to PDF|Экспортировать в PDF/ }).click();
  const printFrame = await findRetainedPrintFrame(viewer);
  await viewer.emulateMedia({ media: 'print' });
  const print = await printFrame.locator('body').evaluate(fingerprintBody);
  await printFrame.locator('html').screenshot({ path: join(outputRoot, 'print.png') });
  const comparison = compareLayoutFingerprints(screen, print);
  const coverage = verifyPrintCoverage(screen, print);

  const projectionHtml = await printFrame.locator('html').evaluate((html) => {
    const cloneWithDeclarativeShadowRoots = (source) => {
      const clone = source.cloneNode(false);
      if (source instanceof globalThis.Element && source.shadowRoot) {
        const template = source.ownerDocument.createElement('template');
        template.setAttribute('shadowrootmode', source.shadowRoot.mode);
        for (const child of source.shadowRoot.childNodes) {
          template.content.append(cloneWithDeclarativeShadowRoots(child));
        }
        clone.append(template);
      }
      for (const child of source.childNodes) clone.append(cloneWithDeclarativeShadowRoots(child));
      return clone;
    };
    return cloneWithDeclarativeShadowRoots(html).outerHTML;
  });
  await writeFile(join(outputRoot, 'projection.html'), projectionHtml);
  await viewer.evaluate((html) => {
    globalThis.document.open();
    globalThis.document.write(`<!doctype html>${html}`);
    globalThis.document.close();
  }, projectionHtml);
  await viewer.evaluate(async () => {
    await globalThis.document.fonts?.ready;
    await new Promise((resolve) => globalThis.requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => globalThis.requestAnimationFrame(() => resolve()));
  });
  await viewer.pdf({
    format: 'A4',
    landscape: false,
    path: join(outputRoot, 'output-portrait.pdf'),
    preferCSSPageSize: true,
    printBackground: true,
  });
  await viewer.pdf({
    format: 'A4',
    landscape: true,
    path: join(outputRoot, 'output-landscape.pdf'),
    preferCSSPageSize: true,
    printBackground: true,
  });
  return { comparison, coverage, print, screen };
}

async function runPrintSmoke({ packageArgument = null, sourceUrl = null }) {
  const root = process.cwd();
  const packagePath = packageArgument ? resolve(root, packageArgument) : null;
  if (packagePath) {
    const packageInfo = await stat(packagePath);
    if (!packageInfo.isFile()) throw new Error(`Print package is not a file: ${packagePath}`);
  }
  if (!packagePath && !sourceUrl) throw new Error('Print smoke source is missing.');
  const outputRoot = join(root, '.tmp/web-snapshot-smoke/results/print-package');
  await rm(join(root, '.tmp/web-snapshot-smoke/results'), { force: true, recursive: true });
  await mkdir(outputRoot, { recursive: true });
  const userDataDir = await mkdtemp(join(tmpdir(), 'sniptale-print-package-profile-'));
  const unpackedDir = await mkdtemp(join(tmpdir(), 'sniptale-print-package-extension-'));
  await cp(join(root, 'dist'), unpackedDir, { recursive: true });
  const manifestPath = join(unpackedDir, 'manifest.json');
  const extensionManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  extensionManifest.host_permissions = [
    ...new Set([...(extensionManifest.host_permissions ?? []), '<all_urls>']),
  ];
  await writeFile(manifestPath, `${JSON.stringify(extensionManifest, null, 2)}\n`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--enable-unsafe-extension-debugging',
      '--lang=en-US',
    ],
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { height: 900, width: 1440 },
  });
  await context.addInitScript(() => {
    const nativeRemove = globalThis.Element.prototype.remove;
    globalThis.Element.prototype.remove = function remove() {
      if (
        this instanceof globalThis.HTMLIFrameElement &&
        this.contentWindow?.__sniptaleSmokePrintRequested === true
      ) {
        this.setAttribute('data-sniptale-smoke-print-projection', 'true');
        return;
      }
      nativeRemove.call(this);
    };
    Object.defineProperty(globalThis, 'print', {
      configurable: true,
      value: () => {
        globalThis.__sniptaleSmokePrintRequested = true;
      },
    });
  });

  let metrics;
  try {
    const loaded = await loadUnpackedExtension(context, unpackedDir);
    const viewer = packagePath
      ? await capturePackage(context, loaded.id, packagePath, outputRoot)
      : await captureSource(context, loaded.id, sourceUrl, outputRoot, {
          navigationWaitUntil: 'commit',
          settleDelayMs: 15_000,
        });
    const result = await exercisePrintProjection(viewer, outputRoot);
    metrics = {
      generatedAt: new Date().toISOString(),
      ...(packagePath
        ? {
            package: await readFile(packagePath).then((packageBytes) => ({
              filename: basename(packagePath),
              sha256: createHash('sha256').update(packageBytes).digest('hex'),
              size: packageBytes.byteLength,
            })),
          }
        : { sourceUrl }),
      pdfBytes: {
        landscape: (await stat(join(outputRoot, 'output-landscape.pdf'))).size,
        portrait: (await stat(join(outputRoot, 'output-portrait.pdf'))).size,
      },
      ...result,
    };
    await viewer.close();
  } finally {
    await context.close();
    await rm(userDataDir, { force: true, recursive: true });
    await rm(unpackedDir, { force: true, recursive: true });
  }

  const failures = [];
  if (metrics.coverage.documentHeightCoverage < 0.99) {
    failures.push(
      `print document covers only ${(metrics.coverage.documentHeightCoverage * 100).toFixed(2)}% of the required content height`
    );
  }
  if (metrics.coverage.documentHeightExpansionRatio > MAX_PRINT_HEIGHT_EXPANSION_RATIO) {
    failures.push(
      `print document expands to ${(metrics.coverage.documentHeightExpansionRatio * 100).toFixed(2)}% of the source document height`
    );
  }
  if (metrics.coverage.unexpandedScrollRegions.length > 0) {
    failures.push(
      `${metrics.coverage.unexpandedScrollRegions.length} internal scroll region(s) remain clipped`
    );
  }
  if (metrics.coverage.textRetentionRatio < 0.25) {
    failures.push(
      `print projection retains only ${(metrics.coverage.textRetentionRatio * 100).toFixed(2)}% of the source text`
    );
  }
  const report = { ...metrics, failures, status: failures.length === 0 ? 'passed' : 'failed' };
  await writeFile(join(outputRoot, 'metrics.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (failures.length > 0) {
    throw new Error(`Web Snapshot print package smoke failed: ${failures.join('; ')}`);
  }
  process.stdout.write(
    `PASS print-source PDF portrait=${metrics.pdfBytes.portrait} landscape=${metrics.pdfBytes.landscape} bytes. Report: ${join(outputRoot, 'metrics.json')}\n`
  );
}

export async function runPrintPackageSmoke(packageArgument) {
  await runPrintSmoke({ packageArgument });
}

export async function runPrintUrlSmoke(sourceUrl) {
  const parsed = new URL(sourceUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('--print-url requires an HTTP(S) URL.');
  }
  await runPrintSmoke({ sourceUrl: parsed.href });
}
