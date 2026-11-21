import { configureGpuPreviewProofBrowser } from '../support/gpu-preview-proof';
import { writeFile } from 'node:fs/promises';
import { bundleQuickReviewAnnotationProbe } from '../support/quick-review-annotation-bundle';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

configureGpuPreviewProofBrowser();

for (const combinedBorders of [false, true]) {
  test(
    'native sniptale.animation.v1 annotations match the offline export in both attachment planes ' +
      `(borders=${combinedBorders})`,
    async ({ page }, info) => {
      test.setTimeout(120_000);
      const host = await startHostServer();
      try {
        const bundle = await bundleQuickReviewAnnotationProbe(host.origin);
        await applyHarnessBootstrap(page, {});
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        const results = await page.evaluate(
          async ({ text, combinedBorders }) => {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
            try {
              const module: typeof import('../support/quick-review-annotation-render-probe') =
                await import(url);
              return await module.parityProbe(combinedBorders);
            } catch (error) {
              if (error instanceof Error && 'failures' in error)
                throw new Error(`${error.message}: ${JSON.stringify(error.failures)}`, {
                  cause: error,
                });
              throw error;
            } finally {
              URL.revokeObjectURL(url);
            }
          },
          { text: bundle.outputFiles[0]!.text, combinedBorders }
        );
        await writeFile(
          info.outputPath('annotation-native-parity.json'),
          JSON.stringify(results, null, 2)
        );
        await page.locator('body > div').last().scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('annotation-native-parity.png'),
          fullPage: false,
        });
        expect(results).toHaveLength(12);
        for (const result of results) {
          expect(result.parity, JSON.stringify(result)).toEqual({ pixels: 0, maxDifference: 0 });
          expect(result.witness.pixels).toBeGreaterThan(100);
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    }
  );
}

for (const { converted, nativeText } of [
  { converted: false, nativeText: false },
  { converted: true, nativeText: false },
  { converted: false, nativeText: true },
  { converted: false, nativeText: 'styles' as const },
]) {
  test(
    nativeText === 'styles'
      ? 'six title styles survive full and fragment MP4 exports (nativeText=styles)'
      : `native MP4/WebM exports retain annotations through full, fragment and presentation clocks ` +
          `(converted=${converted}, nativeText=${nativeText})`,
    async ({ page }, info) => {
      test.setTimeout(120_000);
      const host = await startHostServer();
      try {
        const bundle = await bundleQuickReviewAnnotationProbe(host.origin);
        await applyHarnessBootstrap(page, {});
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        const results = await page.evaluate(
          async ({ text, converted, nativeText }) => {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
            try {
              const module: typeof import('../support/quick-review-annotation-render-probe') =
                await import(url);
              return await module.exportProbe(converted, nativeText);
            } catch (error) {
              if (error instanceof Error && 'failures' in error)
                throw new Error(`${error.message}: ${JSON.stringify(error.failures)}`, {
                  cause: error,
                });
              throw error;
            } finally {
              URL.revokeObjectURL(url);
            }
          },
          { text: bundle.outputFiles[0]!.text, converted, nativeText }
        );
        await writeFile(
          info.outputPath('annotation-native-exports.json'),
          JSON.stringify(results, null, 2)
        );
        expect(results).toHaveLength(nativeText === 'styles' ? 2 : 6);
        if (nativeText === 'styles') {
          await page.screenshot({
            path: info.outputPath('styled-text-decoded-exports.png'),
            fullPage: false,
          });
        }
        for (const result of results) {
          if (nativeText === 'styles') {
            expect(result.visibleStyles).toHaveLength(6);
            for (const count of result.visibleStyles!)
              expect(count, JSON.stringify(result)).toBeGreaterThan(35);
            const hold = result.marker!;
            const { cascade } = hold;
            expect(cascade.decodedTime).toBeCloseTo(cascade.capturedTime, 4);
            expect(cascade.resultTime).toBeCloseTo(1.4, 4);
            expect(hold.resultTime).toBeCloseTo(49 / 30, 4);
            expect(cascade.rendered[0]).toEqual(hold.rendered[0]);
            for (const [frame, rowCount] of [
              [hold, 2],
              [cascade, 1],
            ] as const) {
              expect(frame.preview.backend).toBe('gpu');
              expect(frame.preview.resultTime).toBeCloseTo(frame.resultTime, 4);
              const outputs = [
                frame.preview.canvas,
                frame.preview.gpu,
                frame.rendered,
                frame.decoded,
              ];
              for (const rows of outputs) expect(rows).toHaveLength(rowCount);
              for (const index of frame.rendered.keys()) {
                for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
                  const positions = outputs.map((rows) => rows[index]![edge]);
                  const distance = Math.max(...positions) - Math.min(...positions);
                  expect(distance, JSON.stringify(result)).toBeLessThanOrEqual(1);
                }
              }
            }
          }
          expect(result.bytes).toBeGreaterThan(1000);
          expect(result.witnessPixels).toBeGreaterThan(100);
          // Lossy 8-bit 4:2:0 encoding changes edges; average RGB error stays below 6/255.
          expect(result.meanRgbDifference, JSON.stringify(result)).toBeLessThan(6);
          expect(result.decodedTime).toBeCloseTo(result.capturedTime, 4);
          const duration = result.fragment ? 0.5 : result.presentation ? 3 : 2;
          expect(result.decodedFrames, JSON.stringify(result)).toBe(
            Math.round(duration * result.frameRate)
          );
          expect(result.lastDecodedTime, JSON.stringify(result)).toBeCloseTo(
            duration - 1 / result.frameRate,
            2
          );
          if (result.format === 'webm' && result.presentation) {
            // Preserved microsecond timing omits DefaultDuration; Matroska's final SimpleBlock
            // has no duration. Check the muxed Segment duration and every decoded frame.
            expect(result.metadataDuration).toBeCloseTo(duration, 2);
            expect(result.duration).toBeCloseTo(result.lastDecodedTime, 2);
          } else expect(result.duration).toBeCloseTo(duration, 2);
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    }
  );
}

test.describe('native text phases', () => {
  test('holds native text in the final viewport through CUT and camera split', async ({ page }) => {
    const host = await startHostServer();
    try {
      const bundle = await bundleQuickReviewAnnotationProbe(host.origin);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      const results = await page.evaluate(async (text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          const module: typeof import('../support/quick-review-annotation-render-probe') =
            await import(url);
          return await module.textCutClockProbe();
        } finally {
          URL.revokeObjectURL(url);
        }
      }, bundle.outputFiles[0]!.text);
      expect(results).toHaveLength(15);
      const reference = results.find((frame) => frame.mode === 'reference')!;
      for (const frame of results) {
        const detail = JSON.stringify(frame);
        expect(frame.backend, detail).toBe('gpu');
        if (frame.visible) {
          expect(frame.canvas.pixels, detail).toBeGreaterThan(100);
          expect(frame.gpu.pixels, detail).toBeGreaterThan(100);
          frame.gpu.bounds.forEach((edge, index) =>
            expect(Math.abs(edge - frame.canvas.bounds[index]!), detail).toBeLessThanOrEqual(1)
          );
          if (frame.mode === 'gl' || frame.mode === 'split') {
            frame.canvas.bounds.forEach((edge, index) =>
              expect(Math.abs(edge - reference.canvas.bounds[index]!), detail).toBeLessThanOrEqual(
                1
              )
            );
          }
        } else {
          expect(frame.canvas.pixels, detail).toBe(0);
          expect(frame.gpu.pixels, detail).toBe(0);
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  test('renders all six bundled title faces on light, dark and patterned video frames', async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      const bundle = await bundleQuickReviewAnnotationProbe(host.origin);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      const fonts = await page.evaluate(async (text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          const module: typeof import('../support/quick-review-annotation-render-probe') =
            await import(url);
          return await module.textStyleContactSheet();
        } finally {
          URL.revokeObjectURL(url);
        }
      }, bundle.outputFiles[0]!.text);
      expect(fonts).toEqual([
        '600 24px "Sniptale Text", Arial, sans-serif',
        '600 24px "Sniptale Text", Arial, sans-serif',
        '700 24px "Sniptale Text", Arial, sans-serif',
        '500 24px "Literata Variable", Georgia, serif',
        '500 24px "JetBrains Mono Variable", "Courier New", monospace',
        '700 24px "Oswald Variable", Arial, sans-serif',
      ]);
      await page.screenshot({
        path: info.outputPath('text-styles-contact-sheet.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  test('keeps multiline marker geometry through Canvas, WebGPU and export during cascade and hold', async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const host = await startHostServer();
    try {
      const bundle = await bundleQuickReviewAnnotationProbe(host.origin);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      const results = await page.evaluate(async (text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          const module: typeof import('../support/quick-review-annotation-render-probe') =
            await import(url);
          return await module.textClockProbe(true);
        } finally {
          URL.revokeObjectURL(url);
        }
      }, bundle.outputFiles[0]!.text);
      const [cascade, hold] = results;
      expect(cascade?.marker?.canvas).toHaveLength(1);
      expect(hold?.marker?.canvas).toHaveLength(2);
      expect(cascade?.marker?.canvas[0]).toEqual(hold?.marker?.canvas[0]);
      const [long, short] = hold!.marker!.canvas;
      expect(short!.right - short!.left).toBeLessThan(long!.right - long!.left);
      for (const frame of results) {
        const detail = JSON.stringify(frame);
        expect(frame.backend, detail).toBe('gpu');
        expect(frame.gpu.pixels, detail).toBeGreaterThan(100);
        if (frame === cascade || frame === hold) {
          expect(frame.marker?.gpu, detail).toHaveLength(frame.marker!.canvas.length);
          for (const [index, bounds] of frame.marker!.canvas.entries()) {
            const gpu = frame.marker!.gpu[index]!;
            for (const axis of ['left', 'right', 'top', 'bottom'] as const)
              expect(Math.abs(bounds[axis] - gpu[axis]), detail).toBeLessThanOrEqual(1);
          }
        }
        expect(frame.full, detail).toEqual({ pixels: 0, maxDifference: 0 });
        expect(frame.fragment, detail).toEqual({ pixels: 0, maxDifference: 0 });
      }
      await page.screenshot({
        path: info.outputPath('marker-canvas-gpu-export.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  test('produces the same text placement in Canvas, GPU and both export clocks', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const host = await startHostServer();
    try {
      const bundle = await bundleQuickReviewAnnotationProbe(host.origin);
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      const results = await page.evaluate(async (text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        try {
          const module: typeof import('../support/quick-review-annotation-render-probe') =
            await import(url);
          return await module.textClockProbe();
        } finally {
          URL.revokeObjectURL(url);
        }
      }, bundle.outputFiles[0]!.text);
      expect(results).toHaveLength(3);
      for (const frame of results) {
        const detail = JSON.stringify(frame);
        expect(frame.backend, detail).toBe('gpu');
        expect(frame.canvas.pixels, detail).toBeGreaterThan(100);
        expect(frame.gpu.pixels, detail).toBeGreaterThan(100);
        frame.gpu.bounds.forEach((edge, index) =>
          expect(Math.abs(edge - frame.canvas.bounds[index]!), detail).toBeLessThanOrEqual(1)
        );
        expect(frame.full, detail).toEqual({ pixels: 0, maxDifference: 0 });
        expect(frame.fragment, detail).toEqual({ pixels: 0, maxDifference: 0 });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});
