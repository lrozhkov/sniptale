import { writeFile } from 'node:fs/promises';
import { bundleQuickReviewAnnotationProbe } from '../support/quick-review-annotation-bundle';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const combinedBorders of [false, true]) {
  test(
    'native EffectV1 annotations match the offline export compositor in both attachment planes ' +
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

for (const converted of [false, true]) {
  test(
    `native MP4/WebM exports retain annotations through full, fragment and presentation clocks ` +
      `(converted=${converted})`,
    async ({ page }, info) => {
      test.setTimeout(120_000);
      const host = await startHostServer();
      try {
        const bundle = await bundleQuickReviewAnnotationProbe(host.origin);
        await applyHarnessBootstrap(page, {});
        await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
        await page.locator('[data-ui="gallery.page.root"]').waitFor();
        const results = await page.evaluate(
          async ({ text, converted }) => {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
            try {
              const module: typeof import('../support/quick-review-annotation-render-probe') =
                await import(url);
              return await module.exportProbe(converted);
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
          { text: bundle.outputFiles[0]!.text, converted }
        );
        await writeFile(
          info.outputPath('annotation-native-exports.json'),
          JSON.stringify(results, null, 2)
        );
        expect(results).toHaveLength(6);
        for (const result of results) {
          expect(result.bytes).toBeGreaterThan(1000);
          expect(result.witnessPixels).toBeGreaterThan(100);
          // Lossy 8-bit 4:2:0 encoding changes edges; average RGB error stays below 6/255.
          expect(result.meanRgbDifference, JSON.stringify(result)).toBeLessThan(6);
          expect(result.decodedTime).toBeCloseTo(result.capturedTime, 4);
          const duration = result.fragment ? 0.5 : result.presentation ? 3 : 2;
          expect(result.decodedFrames, JSON.stringify(result)).toBe(duration * 30);
          expect(result.lastDecodedTime, JSON.stringify(result)).toBeCloseTo(duration - 1 / 30, 2);
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
