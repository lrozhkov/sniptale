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
  'source filters match the independent CPU image reference in the production GPU compositor',
  async ({ page }, info) => {
    const host = await startHostServer();
    try {
      const url = `${host.origin}/source-filters.html`;
      await page.route(url, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Source filter proof</title>',
        })
      );
      await page.goto(url);
      const bundle = await build({
        entryPoints: ['tooling/test/e2e/support/source-image-filters-probe.ts'],
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
          const module: typeof import('../support/source-image-filters-probe') = await import(url);
          return await module.probe();
        } finally {
          URL.revokeObjectURL(url);
        }
      }, bundle.outputFiles[0]!.text);
      await writeFile(
        info.outputPath('source-filter-pixels.json'),
        JSON.stringify(result, null, 2)
      );
      expect(result.results).toHaveLength(60);
      for (const row of result.results) {
        expect(row.difference.premultiplied, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.difference.straight, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.repeat).toEqual({ premultiplied: 0, straight: 0 });
      }
      expect(result.orientation).toHaveLength(4);
      for (const row of result.orientation) {
        expect(row.gpu.premultiplied, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.gpu.straight, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.canvas.premultiplied, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.canvas.straight, JSON.stringify(row)).toBeLessThanOrEqual(2);
      }
      expect(result.grainClock.reference.premultiplied).toBeLessThanOrEqual(2);
      expect(result.grainClock.reference.straight).toBeLessThanOrEqual(2);
      expect(result.grainClock.repeat).toEqual({ premultiplied: 0, straight: 0 });
      expect(result.grainClock.changed.straight).toBeGreaterThan(0);
      expect(result.prepared.results).toHaveLength(9);
      for (const row of result.prepared.results) {
        expect(row.gpu.premultiplied, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.gpu.straight, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.canvas.premultiplied, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.canvas.straight, JSON.stringify(row)).toBeLessThanOrEqual(2);
        expect(row.temporaryReleased).toBe(true);
        expect(row.sourceLayers).toBe(row.index === 0 ? 2 : 1);
      }
      expect(result.prepared.enhancedWitnesses).toEqual([
        [255, 0, 0, 255],
        [0, 0, 255, 255],
      ]);
      expect(result.prepared.sourceWitness).toEqual([0, 255, 0, 255]);
      expect(result.prepared.resources).toEqual({ bytes: 0, entries: 0 });
      expect(result.witnesses).toEqual(Array.from({ length: 4 }, () => [12, 80, 170, 255]));
      expect(result.allocated).toBeGreaterThan(0);
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }
);
