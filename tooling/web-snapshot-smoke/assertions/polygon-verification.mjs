import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectDocument } from '../support/document-inspection.mjs';
import { verifyContentExports } from './content-export-verification.mjs';
import { verifySnapshotDiagnostics } from './diagnostics-verification.mjs';
import { compareScreenshots } from '../support/pixel-comparison.mjs';
import { enableForTab, saveSnapshot } from '../runtime/popup-driver.mjs';
import { prepareExternalTarget, settleRenderedDocument } from '../support/page-preparation.mjs';

const VIEWPORT = Object.freeze({ height: 800, width: 1280 });
const QUALITY_POLICY = Object.freeze({
  maxFileSizeMiB: 128,
  maxMegapixels: 80,
  minScalePercent: 100,
  profile: 'maximum',
});

async function findTargetTab(popup, page) {
  const tabs = await popup.evaluate(() => globalThis.chrome.tabs.query({}));
  return tabs.find((tab) => tab.url === page.url()) ?? tabs.find((tab) => tab.active);
}

function resolveRasterScale(width, height) {
  return Math.min(1, 32_768 / Math.max(width, height), Math.sqrt(80_000_000 / (width * height)));
}

async function stitchViewportTiles(context, tiles, width, height) {
  const rasterScale = resolveRasterScale(width, height);
  const outputWidth = Math.max(1, Math.floor(width * rasterScale));
  const outputHeight = Math.max(1, Math.floor(height * rasterScale));
  const compositor = await context.newPage();
  try {
    await compositor.setContent('<canvas></canvas>');
    const dataUrl = await compositor.evaluate(
      async ({ outputHeight, outputWidth, parts, scale }) => {
        const canvas = globalThis.document.querySelector('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const drawing = canvas.getContext('2d');
        for (const part of parts) {
          const image = await new Promise((resolve, reject) => {
            const candidate = new globalThis.Image();
            candidate.onload = () => resolve(candidate);
            candidate.onerror = reject;
            candidate.src = part.url;
          });
          drawing.drawImage(
            image,
            part.sourceX,
            part.sourceY,
            part.sourceWidth,
            part.sourceHeight,
            Math.floor(part.left * scale),
            Math.floor(part.top * scale),
            Math.ceil(part.sourceWidth * scale),
            Math.ceil(part.sourceHeight * scale)
          );
        }
        return canvas.toDataURL('image/png');
      },
      {
        outputHeight,
        outputWidth,
        parts: tiles.map((tile) => ({
          left: tile.left ?? 0,
          sourceHeight: tile.sourceHeight ?? VIEWPORT.height,
          sourceWidth: tile.sourceWidth ?? VIEWPORT.width,
          sourceX: tile.sourceX ?? 0,
          sourceY: tile.sourceY ?? 0,
          top: tile.top,
          url: `data:image/png;base64,${tile.bytes.toString('base64')}`,
        })),
        scale: rasterScale,
      }
    );
    return {
      bytes: Buffer.from(dataUrl.split(',', 2)[1], 'base64'),
      rasterScale,
    };
  } finally {
    await compositor.close();
  }
}

async function captureLiveSource(context, page, descriptor) {
  if (!descriptor.scrollRootSelector) {
    const bytes = await page.screenshot({
      animations: 'disabled',
      fullPage: true,
    });
    const dimensions = await page.evaluate(() => {
      const root = globalThis.document.scrollingElement ?? globalThis.document.documentElement;
      return { height: root.scrollHeight, width: root.scrollWidth };
    });
    return { bytes, geometry: dimensions, rasterScale: 1 };
  }
  const root = page.locator(descriptor.scrollRootSelector).first();
  const geometry = await root.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottomInset: globalThis.innerHeight - rect.bottom,
      height: element.scrollHeight,
      left: rect.left,
      top: rect.top,
      viewportHeight: element.clientHeight,
      width: globalThis.innerWidth,
    };
  });
  const outputHeight = Math.ceil(geometry.top + geometry.height + geometry.bottomInset);
  const tiles = [];
  const seenTops = new Set();
  for (
    let requestedTop = 0;
    requestedTop < geometry.height;
    requestedTop += geometry.viewportHeight
  ) {
    const top = await root.evaluate((element, nextTop) => {
      element.scrollTop = nextTop;
      return element.scrollTop;
    }, requestedTop);
    if (seenTops.has(top)) continue;
    seenTops.add(top);
    await page.waitForTimeout(100);
    const bytes = await page.screenshot({
      animations: 'disabled',
      fullPage: false,
    });
    if (top === 0) {
      tiles.push({
        bytes,
        sourceHeight: VIEWPORT.height,
        sourceWidth: VIEWPORT.width,
        top: 0,
      });
    } else {
      tiles.push({
        bytes,
        sourceHeight: geometry.viewportHeight,
        sourceWidth: geometry.width,
        sourceY: geometry.top,
        top: geometry.top + top,
      });
    }
  }
  await root.evaluate((element) => {
    element.scrollTop = 0;
  });
  const stitched = await stitchViewportTiles(context, tiles, geometry.width, outputHeight);
  return {
    ...stitched,
    geometry: { height: outputHeight, width: geometry.width },
  };
}

async function captureStaticDocument(context, viewer, iframe, frame, geometry) {
  const tiles = [];
  const seenTops = new Set();
  const viewportHeight = VIEWPORT.height;
  for (let requestedTop = 0; requestedTop < geometry.height; requestedTop += viewportHeight) {
    const top = await frame.evaluate((nextTop) => {
      globalThis.scrollTo(0, nextTop);
      return (globalThis.document.scrollingElement ?? globalThis.document.documentElement)
        .scrollTop;
    }, requestedTop);
    if (seenTops.has(top)) continue;
    seenTops.add(top);
    await viewer.waitForTimeout(30);
    tiles.push({
      bytes: await iframe.screenshot({ animations: 'disabled' }),
      top,
    });
  }
  await frame.evaluate(() => globalThis.scrollTo(0, 0));
  return stitchViewportTiles(context, tiles, geometry.width, geometry.height);
}

async function materializeStaticDocument(context, viewer) {
  const staticButton = viewer.getByRole('button', {
    name: /Static document|Статический документ/i,
  });
  if ((await staticButton.count()) > 0) await staticButton.click();
  const iframe = viewer.locator('iframe').first();
  await iframe.waitFor({ state: 'visible', timeout: 30_000 });
  await iframe.evaluate((element, viewport) => {
    Object.assign(element.style, {
      border: '0',
      height: `${viewport.height}px`,
      inset: '0',
      margin: '0',
      maxHeight: 'none',
      position: 'fixed',
      width: `${viewport.width}px`,
      zIndex: '2147483647',
    });
  }, VIEWPORT);
  const handle = await iframe.elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error('Viewer did not materialize the static Web Copy frame');
  const geometry = await settleRenderedDocument(frame);
  const info = await inspectDocument(frame);
  const capture = await captureStaticDocument(context, viewer, iframe, frame, geometry);
  return { ...capture, geometry, info };
}

async function materializeRetainedScreenshot(viewer) {
  await viewer.getByRole('button', { name: /Screenshot|Скриншот/i }).click();
  const image = viewer.getByTestId('snapshot-visual-image');
  await image.waitFor({ state: 'visible', timeout: 30_000 });
  await image.evaluate((element) => element.decode());
  const dataUrl = await image.evaluate(async (element) => {
    const blob = await fetch(element.src).then((response) => response.blob());
    return new Promise((resolve, reject) => {
      const reader = new globalThis.FileReader();
      reader.onerror = () => reject(new Error('Retained screenshot could not be read'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  });
  return {
    bytes: Buffer.from(dataUrl.split(',', 2)[1], 'base64'),
    geometry: null,
    info: null,
    rasterScale: 1,
  };
}

function evaluateThresholds(descriptor, metrics) {
  const failures = [];
  const limits = descriptor.thresholds;
  if (metrics.heightDeltaRatio > limits.heightDeltaRatio) {
    failures.push(`height mismatch ${(metrics.heightDeltaRatio * 100).toFixed(1)}%`);
  }
  if (metrics.pixel.changedPixelRatio > limits.changedPixelRatio) {
    failures.push(`pixel diff ${(metrics.pixel.changedPixelRatio * 100).toFixed(1)}%`);
  }
  if (metrics.pixel.meanAbsoluteChannelDelta > limits.meanChannelDelta) {
    failures.push(`mean channel delta ${metrics.pixel.meanAbsoluteChannelDelta.toFixed(1)}`);
  }
  if (metrics.pixel.unmatchedPixelRatio > limits.missingAreaRatio) {
    failures.push(`missing area ${(metrics.pixel.unmatchedPixelRatio * 100).toFixed(1)}%`);
  }
  const sourceImages = metrics.sanity.source.images;
  const exportedImages = metrics.sanity.exported?.images;
  if (
    descriptor.comparison === 'static' &&
    sourceImages > 0 &&
    exportedImages / sourceImages < 0.9
  ) {
    failures.push(`image retention ${exportedImages}/${sourceImages}`);
  }
  const sourceTextLength = metrics.sanity.source.textLength;
  const exportedTextLength = metrics.sanity.exported?.textLength;
  if (
    descriptor.comparison === 'static' &&
    sourceTextLength > 0 &&
    exportedTextLength / sourceTextLength < 0.95
  ) {
    failures.push(`text retention ${exportedTextLength}/${sourceTextLength}`);
  }
  return failures;
}

async function captureSourceEvidence(context, descriptor, page, targetOut) {
  const preparedGeometry = await prepareExternalTarget(page, descriptor);
  const info = await inspectDocument(page);
  const capture = await captureLiveSource(context, page, descriptor);
  await writeFile(join(targetOut, 'source.png'), capture.bytes);
  return { ...capture, info, preparedGeometry };
}

async function saveTargetSnapshot(popup, page) {
  const tab = await findTargetTab(popup, page);
  if (!tab?.id) throw new Error(`Browser tab was not found for ${page.url()}`);
  await enableForTab(popup, page, tab.id);
  await popup.evaluate((id) => globalThis.chrome.tabs.update(id, { active: true }), tab.id);
  await page.bringToFront();
  return saveSnapshot(popup, tab.id, { richPackage: true, timeoutMs: 180_000 });
}

async function readViewerArchive(viewer) {
  const archiveBase64 = await viewer
    .locator('a[download][href^="blob:"]')
    .first()
    .evaluate(async (link) => {
      const bytes = new Uint8Array(
        await fetch(link.href).then((response) => response.arrayBuffer())
      );
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return globalThis.btoa(binary);
    });
  return Buffer.from(archiveBase64, 'base64');
}

async function captureExportedEvidence(context, descriptor, extensionId, saved) {
  const viewer = await context.newPage();
  await viewer.setViewportSize(VIEWPORT);
  try {
    await viewer.goto(
      `chrome-extension://${extensionId}/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=${encodeURIComponent(saved.assetId)}`
    );
    const evidence =
      descriptor.comparison === 'static'
        ? await materializeStaticDocument(context, viewer)
        : await materializeRetainedScreenshot(viewer);
    return { ...evidence, archiveBytes: await readViewerArchive(viewer) };
  } finally {
    await viewer.close();
  }
}

function buildTargetMetrics(descriptor, page, source, exported, saved, pixel) {
  const sourceGeometry = source.geometry;
  const exportedGeometry = exported.geometry ?? {
    height: pixel.rightHeight / exported.rasterScale,
    width: pixel.rightWidth / exported.rasterScale,
  };
  return {
    authority: descriptor.comparison,
    exported: {
      geometry: exportedGeometry,
      raster: {
        height: pixel.rightHeight,
        scale: exported.rasterScale,
        width: pixel.rightWidth,
      },
    },
    heightDeltaRatio:
      Math.abs(sourceGeometry.height - exportedGeometry.height) /
      Math.max(sourceGeometry.height, 1),
    pixel,
    preparedGeometry: source.preparedGeometry,
    qualityPolicy: QUALITY_POLICY,
    sanity: {
      exported: exported.info
        ? {
            elements: exported.info.elementCount,
            imageStats: exported.info.imageStats,
            images: exported.info.loadedImages,
            textLength: exported.info.textLength,
            unloadedImageSamples: exported.info.unloadedImageSamples,
          }
        : null,
      source: {
        elements: source.info.elementCount,
        imageStats: source.info.imageStats,
        images: source.info.loadedImages,
        textLength: source.info.textLength,
        unloadedImageSamples: source.info.unloadedImageSamples,
      },
    },
    source: {
      geometry: sourceGeometry,
      raster: {
        height: pixel.leftHeight,
        scale: source.rasterScale,
        width: pixel.leftWidth,
      },
    },
    status: 'passed',
    thresholds: descriptor.thresholds,
    ...(descriptor.toleranceReason ? { toleranceReason: descriptor.toleranceReason } : {}),
    url: page.url(),
    warnings: saved.warnings ?? [],
  };
}

export async function verifyExternalTarget({ context, descriptor, extensionId, out, popup }) {
  const targetOut = join(out, descriptor.id);
  await mkdir(targetOut, { recursive: true });
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);
  try {
    const source = await captureSourceEvidence(context, descriptor, page, targetOut);
    const saved = await saveTargetSnapshot(popup, page);
    const exported = await captureExportedEvidence(context, descriptor, extensionId, saved);
    await writeFile(join(targetOut, 'package.zip'), exported.archiveBytes);
    const diagnostics = await verifySnapshotDiagnostics(exported.archiveBytes);
    const contentExports = descriptor.contentExpectations
      ? await verifyContentExports(exported.archiveBytes, {
          expectedUrl: page.url(),
          ...descriptor.contentExpectations,
        })
      : null;
    await writeFile(
      join(targetOut, 'diagnostics-check.json'),
      `${JSON.stringify(diagnostics, null, 2)}\n`
    );
    if (contentExports) {
      await writeFile(
        join(targetOut, 'content-check.json'),
        `${JSON.stringify(contentExports, null, 2)}\n`
      );
    }
    await writeFile(join(targetOut, 'exported.png'), exported.bytes);
    const pixel = await compareScreenshots(context, source.bytes, exported.bytes, {
      createDiff: true,
      normalizeDimensions:
        descriptor.comparison === 'screenshot' || source.rasterScale !== exported.rasterScale,
    });
    const diffBase64 = pixel.diffPngBase64;
    delete pixel.diffPngBase64;
    await writeFile(join(targetOut, 'diff.png'), Buffer.from(diffBase64, 'base64'));
    const metrics = buildTargetMetrics(descriptor, page, source, exported, saved, pixel);
    const failures = evaluateThresholds(descriptor, metrics);
    failures.push(...diagnostics.violations.map((id) => `diagnostics ${id}`));
    if (contentExports) {
      failures.push(...contentExports.violations.map((id) => `content ${id}`));
    }
    metrics.diagnostics = {
      status: diagnostics.status,
      violations: diagnostics.violations,
    };
    if (contentExports) {
      metrics.contentExports = {
        metrics: contentExports.metrics,
        status: contentExports.status,
        violations: contentExports.violations,
      };
    }
    metrics.status = failures.length === 0 ? 'passed' : 'failed';
    if (failures.length > 0) metrics.failures = failures;
    await writeFile(join(targetOut, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
    return metrics;
  } finally {
    await page.close();
  }
}
