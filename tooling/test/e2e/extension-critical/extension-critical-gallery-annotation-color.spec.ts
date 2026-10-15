import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

test('builtin RGBA survives sandbox and flat/perspective composition with declared secondary opacity', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/annotation-color-probe.ts'],
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
        return await (await import(url)).probeAnnotationColors();
      } finally {
        URL.revokeObjectURL(url);
      }
    }, bundle.outputFiles[0]!.text);
    await writeFile(
      info.outputPath('annotation-color-stages.json'),
      JSON.stringify(results, null, 2)
    );
    await page.screenshot({
      path: info.outputPath('annotation-color-stages.png'),
      fullPage: false,
    });
    expect(results).toHaveLength(20);
    for (const result of results) {
      const expectedAlpha =
        result.role === 'secondary' ? Math.round(result.alpha * 0.84) : result.alpha;
      expect(result.bitmap.alpha, JSON.stringify(result)).toBeCloseTo(expectedAlpha, 0);
      expect(result.bitmap.rgbError, JSON.stringify(result)).toBeLessThanOrEqual(2);
      expect(result.bitmap.count).toBeGreaterThan(100);
      expect(result.final.minimumError, JSON.stringify(result)).toBeLessThanOrEqual(2);
      expect(result.final.count, JSON.stringify(result)).toBeGreaterThan(100);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
