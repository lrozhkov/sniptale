import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
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
gpuTest(
  'source filters agree across both main renderers and the production frame exporters',
  async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 900 });
    const host = await startHostServer();
    try {
      const url = `${host.origin}/source-filter-editors.html`;
      await page.route(url, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Source filter editor/export proof</title>',
        })
      );
      await page.goto(url);
      const bundle = await build({
        entryPoints: ['tooling/test/e2e/support/source-filter-editors-probe.ts'],
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
          const module: typeof import('../support/source-filter-editors-probe') = await import(url);
          return await module.probe();
        } finally {
          URL.revokeObjectURL(url);
        }
      }, bundle.outputFiles[0]!.text);
      await writeFile(
        info.outputPath('source-filter-editor-export.json'),
        JSON.stringify(result, null, 2)
      );
      expect(result.rows).toHaveLength(11);
      for (const row of result.rows) {
        expect(row.preview).toHaveLength(4);
        for (const preview of row.preview) {
          expect(preview.actual, JSON.stringify(preview)).toBe(preview.requested);
          expect(preview.difference.maximum, JSON.stringify(preview)).toBeLessThanOrEqual(2);
        }
        expect(row.nativeExport.maximum, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.exports).toHaveLength(2);
        for (const output of row.exports) {
          expect(output.bytes).toBeGreaterThan(0);
          expect(output.receipt.videoReencoded).toBe(true);
          expect(output.receipt.duration).toBeCloseTo(0.4, 5);
          expect(output.difference.mean, JSON.stringify(output)).toBeLessThanOrEqual(3);
          expect(output.difference.maximum, JSON.stringify(output)).toBeLessThanOrEqual(16);
          expect(output.samples).toHaveLength(12);
          expect(output.timeResolution).toBe(output.format === 'mp4' ? 30 : 1000);
          const quantized = (time: number) =>
            Math.round(time * output.timeResolution) / output.timeResolution;
          for (const [i, sample] of output.samples.entries()) {
            expect(sample.timestamp).toBeCloseTo(quantized(i / 30), 8);
            expect(sample.duration).toBeCloseTo(quantized((i + 1) / 30) - quantized(i / 30), 8);
          }
        }
      }
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }
);
