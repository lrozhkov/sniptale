import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

test('prepared preview matches the existing export composition with every visible layer active', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/quick-preview-render-parity-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.woff2': 'dataurl' },
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
