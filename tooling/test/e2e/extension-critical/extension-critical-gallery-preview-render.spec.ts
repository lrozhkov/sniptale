import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { sanitizeStructuredDiagnosticExportData } from '../../../../packages/platform/src/observability/diagnostics/sanitizer';
import { startHostServer } from '../support/host-server';

const gpuTest = test.extend({
  launchOptions: {
    args:
      process.platform === 'linux'
        ? [
            '--enable-unsafe-webgpu',
            '--use-angle=swiftshader',
            '--use-vulkan=swiftshader',
            '--enable-features=Vulkan',
            '--disable-vulkan-surface',
          ]
        : [],
  },
});

test('prepared preview matches the existing export composition with every visible layer active', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/quick-preview-render-parity-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.woff2': 'dataurl', '.bin': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const results = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      const module: typeof import('../support/quick-preview-render-parity-probe') = await import(
        url
      );
      return await module.probe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('preview-render-parity.json'), JSON.stringify(results, null, 2));
  await page.screenshot({ path: info.outputPath('preview-render-parity.png'), fullPage: false });
  await page.locator('body > div').last().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('preview-render-spatial-parity.png'),
    fullPage: false,
  });
  expect(results).toHaveLength(5);
  const spatial = results.filter((result) => 'geometry' in result);
  expect(spatial).toHaveLength(2);
  expect(spatial[0]!.geometry.watermarkBounds).toEqual(spatial[1]!.geometry.watermarkBounds);
  for (const result of results) {
    const evidence = JSON.stringify(result);
    if ('exposureCount' in result) {
      expect(result.exposureCount, evidence).toBeGreaterThan(1);
      const resources = result.resourceEvidence;
      expect(resources.backing).toEqual(result.geometry.backing);
      expect(resources.budgets.length, evidence).toBeGreaterThan(1);
      expect(resources.peakManagedBytes, evidence).toBeGreaterThan(0);
      expect(resources.peakCanvasCount, evidence).toBeGreaterThan(0);
      expect(resources.peakManagedBytes, evidence).toBeLessThanOrEqual(
        Math.max(...resources.budgets.map((budget) => budget.maximumManagedBytes))
      );
      expect(resources.peakCanvasCount, evidence).toBeLessThanOrEqual(
        Math.max(...resources.budgets.map((budget) => budget.maximumCanvases))
      );
      expect(resources.managedBytesBeforeDispose, evidence).toBeGreaterThan(0);
      expect(resources.canvasCountBeforeDispose, evidence).toBeGreaterThan(0);
    }
    expect(result.parity.maxDifference, evidence).toBe(0);
    expect(result.parity.differentPixels, evidence).toBe(0);
    for (const [layer, pixels] of Object.entries(result.witnesses))
      expect(pixels, `${layer}: ${evidence}`).toBeGreaterThan(0);
    expect(result.resources, evidence).toEqual({ canvases: 0, bytes: 0 });
  }
});

gpuTest.describe('authored GPU queue', () => {
  gpuTest(
    'two authored GPU requests match their sequential frames with independent output leases',
    async ({ page }, info) => {
      const host = await startHostServer();
      try {
        const url = `${host.origin}/gpu-queue-proof.html`;
        await page.route(url, (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><meta charset="utf-8"><title>GPU queue proof</title>',
          })
        );
        await page.goto(url);
        const bundle = await build({
          entryPoints: ['tooling/test/e2e/support/quick-preview-render-parity-probe.ts'],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          write: false,
          loader: { '.svg': 'text', '.woff2': 'dataurl', '.bin': 'dataurl' },
          define: { 'process.env.NODE_ENV': '"production"' },
        });
        const result = await page.evaluate(async (text) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            const module: typeof import('../support/quick-preview-render-parity-probe') =
              await import(url);
            return await module.probeGpuQueue();
          } finally {
            URL.revokeObjectURL(url);
          }
        }, bundle.outputFiles[0]!.text);
        await writeFile(
          info.outputPath('preview-gpu-queue.json'),
          JSON.stringify(sanitizeStructuredDiagnosticExportData(result), null, 2)
        );
        const evidence = JSON.stringify(result);
        expect(result.code, evidence).toBe('OK');
        expect(result.size).toEqual({ width: 840, height: 472 });
        expect(result.renderFacts, evidence).toHaveLength(4);
        expect(
          result.renderFacts.every((frame) => frame.gpu && frame.spatial),
          evidence
        ).toBe(true);
        expect(
          result.renderFacts.every((frame) => frame.cameraScale > 1),
          evidence
        ).toBe(true);
        expect(
          result.renderFacts.map(({ source, result, represented }) => [source, result, represented])
        ).toEqual([0.15, 1.25, 0.15, 1.25].map((at) => [at, at, at]));
        expect(result.featureStates, evidence).toHaveLength(2);
        expect(
          result.featureStates.every((state) => state.lensScale > 1),
          evidence
        ).toBe(true);
        expect(result.featureStates[0]!.lensX).not.toBe(result.featureStates[1]!.lensX);
        expect(
          result.featureStates.every((state) => state.fadeOpacity > 0 && state.fadeOpacity < 1),
          evidence
        ).toBe(true);
        expect(result.referencesDifferentPixels, evidence).toBeGreaterThan(0);
        expect(result.peakRequests, evidence).toBe(2);
        expect(result.peakCompleted, evidence).toBe(2);
        expect(result.distinctOutputs, evidence).toBe(true);
        expect(result.ownedSourceFrames, evidence).toBe(2);
        expect(result.closedSources, evidence).toBe(2);
        expect(result.sourcesStillOpen, evidence).toBe(true);
        expect(result.backgroundReads, evidence).toBe(1);
        expect(result.watermarkBounds.width, evidence).toBeGreaterThan(0);
        expect(result.watermarkBounds.height, evidence).toBeGreaterThan(0);
        expect(result.borrowedSources, evidence).toBeGreaterThanOrEqual(4);
        expect(result.parity, evidence).toEqual([
          { maxDifference: 0, differentPixels: 0 },
          { maxDifference: 0, differentPixels: 0 },
        ]);
        expect(result.budgets.length, evidence).toBeGreaterThan(0);
        expect(result.beforeDispose?.peakManagedBytes, evidence).toBeGreaterThan(0);
        expect(result.beforeDispose?.peakManagedBytes, evidence).toBeLessThanOrEqual(
          Math.max(...result.budgets.map((budget) => budget.maximumManagedBytes))
        );
        expect(result.beforeDispose?.peakCanvasCount, evidence).toBeLessThanOrEqual(
          Math.max(...result.budgets.map((budget) => budget.maximumCanvases))
        );
        expect(result.beforeDispose?.canvasLeases, evidence).toBe(0);
        expect(result.beforeDispose?.byteLeases, evidence).toBe(0);
        expect(result.resources?.canvasCount, evidence).toBe(0);
        expect(result.resources?.managedBytes, evidence).toBe(0);
        expect(result.activeRequests, evidence).toBe(0);
        expect(result.renderFailures, evidence).toBe(0);
        expect(result.outstandingCompleted, evidence).toBe(0);
        expect(result.cleanupErrors, evidence).toBe(0);
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    }
  );

  gpuTest(
    'authored GPU direct surfaces match bitmap frames through the compositor with three retained leases',
    async ({ page }, info) => {
      const host = await startHostServer();
      let captures = 0;
      try {
        const url = `${host.origin}/gpu-direct-output-proof.html`;
        await page.route(url, (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><meta charset="utf-8"><title>GPU direct output proof</title><style>body{margin:0;background:black}</style>',
          })
        );
        await page.goto(url);
        await page.exposeFunction('__sniptaleCaptureDirectQueue', async () => {
          const screenshot = await page.screenshot({
            path: info.outputPath(`preview-gpu-direct-compositor-${++captures}.png`),
            clip: { x: 0, y: 0, width: 840, height: 472 },
            scale: 'css',
            animations: 'disabled',
          });
          return screenshot.toString('base64');
        });
        const bundle = await build({
          entryPoints: ['tooling/test/e2e/support/quick-preview-render-parity-probe.ts'],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          write: false,
          loader: { '.svg': 'text', '.woff2': 'dataurl', '.bin': 'dataurl' },
          define: { 'process.env.NODE_ENV': '"production"' },
        });
        const result = await page.evaluate(async (text) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
          try {
            const module: typeof import('../support/quick-preview-render-parity-probe') =
              await import(url);
            return await module.probeGpuDirectQueue(async () => {
              const capture = Reflect.get(globalThis, '__sniptaleCaptureDirectQueue');
              if (typeof capture !== 'function')
                throw new Error('Compositor capture is unavailable');
              const encoded: unknown = await capture();
              if (typeof encoded !== 'string') throw new Error('Compositor capture is invalid');
              const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
              const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
              const snapshot = document.createElement('canvas');
              try {
                if (image.width !== 840 || image.height !== 472)
                  throw new Error('Compositor dimensions changed');
                snapshot.width = image.width;
                snapshot.height = image.height;
                const context = snapshot.getContext('2d');
                if (!context) throw new Error('Compositor PNG decoder is unavailable');
                context.drawImage(image, 0, 0);
                return context.getImageData(0, 0, snapshot.width, snapshot.height);
              } finally {
                image.close();
                snapshot.width = snapshot.height = 0;
              }
            });
          } finally {
            URL.revokeObjectURL(url);
          }
        }, bundle.outputFiles[0]!.text);
        await writeFile(
          info.outputPath('preview-gpu-direct-output.json'),
          JSON.stringify(sanitizeStructuredDiagnosticExportData(result), null, 2)
        );
        const evidence = JSON.stringify(result);
        expect(result.code, evidence).toBe('OK');
        expect(result.directProof, evidence).toBe(true);
        // Synthetic 840x472 quality proof; this case does not measure playback FPS.
        expect(result.size).toEqual({ width: 840, height: 472 });
        expect(captures, evidence).toBe(4);
        expect(
          result.renderFacts
            .slice(0, 3)
            .map(({ source, result, represented }) => [source, result, represented])
        ).toEqual([0.15, 1.25, 0.15].map((at) => [at, at, at]));
        expect(
          result.renderFacts
            .slice(3)
            .sort((a, b) => a.source - b.source)
            .map(({ source, result, represented }) => [source, result, represented])
        ).toEqual([0.15, 1.25].map((at) => [at, at, at]));
        expect(
          result.renderFacts.every((frame) => frame.gpu && frame.spatial && frame.cameraScale > 1),
          evidence
        ).toBe(true);
        expect(result.renderFacts.map((frame) => frame.direct)).toEqual([
          false,
          false,
          true,
          true,
          true,
        ]);
        expect(
          result.featureStates.every(
            (state) => state.lensScale > 1 && state.fadeOpacity > 0 && state.fadeOpacity < 1
          ),
          evidence
        ).toBe(true);
        expect(result.featureStates[0]!.lensX).not.toBe(result.featureStates[1]!.lensX);
        expect(result.watermarkBounds.width, evidence).toBeGreaterThan(0);
        expect(result.watermarkBounds.height, evidence).toBeGreaterThan(0);
        expect(result.referencesDifferentPixels, evidence).toBeGreaterThan(0);
        expect(result.peakRequests, evidence).toBe(2);
        expect(result.peakCompleted, evidence).toBe(3);
        expect(result.ringSurfaces, evidence).toBe(3);
        expect(result.distinctOutputs, evidence).toBe(true);
        expect(result.hiddenBeforePresent, evidence).toBe(3);
        expect(result.sourceHoldsBeforePresent, evidence).toBe(3);
        expect(result.direct2DPublications, evidence).toBe(0);
        expect(result.parity, evidence).toHaveLength(2);
        for (const parity of result.parity)
          expect(parity.maxDifference, evidence).toBeLessThanOrEqual(1);
        expect(result.ownedSourceFrames, evidence).toBe(2);
        expect(result.closedSources, evidence).toBe(2);
        expect(result.sourcesStillOpen, evidence).toBe(true);
        expect(result.backgroundReads, evidence).toBe(1);
        expect(result.borrowedSources, evidence).toBeGreaterThanOrEqual(5);
        expect(result.outputLeases, evidence).toBe(0);
        expect(result.activeRequests, evidence).toBe(0);
        expect(result.outstandingCompleted, evidence).toBe(0);
        expect(result.renderFailures, evidence).toBe(0);
        expect(result.cleanupErrors, evidence).toBe(0);
        expect(result.beforeDispose?.canvasLeases, evidence).toBe(0);
        expect(result.beforeDispose?.byteLeases, evidence).toBe(0);
        expect(result.resources?.canvasCount, evidence).toBe(0);
        expect(result.resources?.managedBytes, evidence).toBe(0);
      } finally {
        host.server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    }
  );
});
