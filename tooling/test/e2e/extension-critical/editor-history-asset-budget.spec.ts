import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { createInlineWorkerBundlePlugin } from '../support/inline-worker-bundle';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  GALLERY_HARNESS_PATH,
} from '../extension-critical.helpers';

test('PNG layers totaling over 32 MiB share assets and preserve 1000 actions through native reopen', async ({
  page,
  context,
}, info) => {
  test.setTimeout(180_000);
  const host = await startHostServer();
  let active = page;
  const bootstrap = async () => {
    await active.setViewportSize({ width: 1280, height: 560 });
    await applyHarnessBootstrap(active, {
      preserveMediaLibrary: true,
      editorDispatchBootstrapPayload: false,
      storage: { 'sniptale-locale-preference': 'en' },
    });
  };
  try {
    await bootstrap();
    await active.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
    await active.locator('[data-ui="gallery.page.root"]').waitFor();
    const bundle = await build({
      entryPoints: ['tooling/test/e2e/support/editor-history-capacity-probe.ts'],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      plugins: [createInlineWorkerBundlePlugin()],
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    });
    const text = bundle.outputFiles[0]!.text;
    const seeded = await active.evaluate(async (text) => {
      const dimension = 2600;
      const canvas = new OffscreenCanvas(dimension, dimension);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing real PNG encoder.');
      const pixels = context.createImageData(dimension, dimension);
      const words = new Uint32Array(pixels.data.buffer);
      const encode = async (state: number) => {
        for (let index = 0; index < words.length; index++) {
          state ^= state << 13;
          state ^= state >>> 17;
          state ^= state << 5;
          words[index] = 0xff000000 | (state & 0xffffff);
        }
        context.putImageData(pixels, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === 'string'
              ? resolve(reader.result)
              : reject(new Error('Missing PNG data URL.'));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        return { image, size: blob.size };
      };
      const first = await encode(0x13579bdf);
      const second = await encode(0x2468ace1);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        return {
          ...(await (await import(url)).seedRasterBudget([first.image, second.image], dimension)),
          pngBytes: first.size + second.size,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, text);
    expect(seeded.pngBytes).toBeGreaterThan(32 * 1024 * 1024);
    expect(seeded.encodedBytes).toBeGreaterThan(32 * 1024 * 1024);
    expect(seeded.headBytes).toBeLessThan(1024 * 1024);
    expect(seeded).toMatchObject({
      imageReferences: 2,
      physicalImageIds: 2,
      documentUsesHistoryImage: true,
    });
    const native = () => readNative(active, text, seeded.id);
    const layers = () => active.locator('[data-layer-reorder-row^="large-layer-"]');
    const editorUrl = `${host.origin}${EDITOR_HARNESS_PATH}?assetId=${seeded.id}`;
    await active.goto(editorUrl);
    await expect(layers()).toHaveCount(3);
    await expect.poll(native).toMatchObject({ count: 1000, cursor: 1000 });
    await active.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect(layers()).toHaveCount(0);
    await expect.poll(native).toMatchObject({ count: 1000, cursor: 999, future: 1 });
    await active.close();
    active = await context.newPage();
    await bootstrap();
    await active.goto(editorUrl);
    const redo = active.locator('[data-ui="editor.floating.tool-rail.history.redo"]');
    await expect(redo).toBeEnabled();
    await expect(layers()).toHaveCount(0);
    await redo.click();
    await expect(layers()).toHaveCount(3);
    await expect.poll(native).toMatchObject({ count: 1000, cursor: 1000, future: 0 });
    await active.screenshot({
      path: info.outputPath('large-raster-after-reopen-redo.png'),
      fullPage: false,
    });
    await info.attach('native-raster-budget.json', {
      body: JSON.stringify(seeded),
      contentType: 'application/json',
    });
  } finally {
    host.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      host.server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

async function readNative(page: Page, text: string, id: string) {
  return page.evaluate(
    async ({ text, id }) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try {
        return await (await import(url)).inspectRasterBudget(id);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { text, id }
  );
}
