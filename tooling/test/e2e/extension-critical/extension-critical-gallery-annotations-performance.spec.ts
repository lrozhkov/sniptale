import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

test('native 0/1/3/6 annotation frames at 1080p and 4K retain resource budgets and clean up', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/quick-review-annotation-render-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const host = await startHostServer();
  try {
    await applyHarnessBootstrap(page, {});
    await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    const results = await page.evaluate(async (text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        const module: typeof import('../support/quick-review-annotation-render-probe') =
          await import(url);
        return {
          performance: await module.performanceProbe(),
          failure: await module.resourceFailureProbe(),
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(
      info.outputPath('annotation-native-performance.json'),
      JSON.stringify(results, null, 2)
    );
    expect(results.performance.map(({ width, count }) => [width, count])).toEqual([
      [1920, 0],
      [1920, 1],
      [1920, 3],
      [1920, 6],
      [3840, 0],
      [3840, 1],
      [3840, 3],
      [3840, 6],
    ]);
    for (const result of results.performance) {
      const evidence = JSON.stringify(result);
      expect(result.durations, evidence).toHaveLength(4);
      expect(
        result.durations.every((time) => Number.isFinite(time) && time >= 0),
        evidence
      ).toBe(true);
      expect(result.resources.peakManagedBytes, evidence).toBeLessThanOrEqual(
        Math.max(...result.budgets.map((budget) => budget.maximumManagedBytes))
      );
      expect(result.resources.peakCanvasCount, evidence).toBeLessThanOrEqual(
        Math.max(...result.budgets.map((budget) => budget.maximumCanvases))
      );
      expect(result.resources.managedBytes, evidence).toBe(0);
      expect(result.resources.canvasCount, evidence).toBe(0);
      expect(result.authoredUnchanged, evidence).toBe(true);
    }
    expect(results.failure.exhaustion).toBe('PreviewRenderResourceError');
    expect(results.failure.afterFailure).toBe(results.failure.sourceBytes);
    expect(results.failure.overlap).toBe('Annotation bitmap batch is already admitted.');
    expect(results.failure.heldBatch).toBe('Annotation bitmap batch is already admitted.');
    expect(results.failure.resources.peakManagedBytes).toBeLessThanOrEqual(
      results.failure.exactBudget
    );
    expect(results.failure.resources.managedBytes).toBe(0);
    expect(results.failure.resources.canvasCount).toBe(0);
    expect(results.failure.authoredUnchanged).toBe(true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
