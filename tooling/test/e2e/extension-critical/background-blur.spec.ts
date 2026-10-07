import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

test('background SVG blur matches live and export and stays opaque at edges', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/background-blur-probe.tsx'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.woff2': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const result = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    try {
      return (await import(url)).probe();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  expect(result.mismatch).toBe(0);
  for (const edge of result.edge)
    for (let i = 0; i < edge.length; i += 4) {
      expect(edge[i]).toBeGreaterThan(110);
      expect(edge[i]).toBeLessThan(145);
      expect(edge[i + 3]).toBe(255);
    }
  for (const scene of result.scenes) {
    expect(scene.center).toEqual([255, 0, 0, 255]);
    expect(scene.outside[0]).toBeGreaterThan(110);
    expect(scene.outside[0]).toBeLessThan(145);
  }
  await page.screenshot({ path: info.outputPath('background-blur-pixels.png'), fullPage: false });
});

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
  { width: 1200, height: 560 },
]) {
  test(`background blur control persists and supports undo ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const { startHostServer } = await import('../support/host-server');
    const { applyHarnessBootstrap, GALLERY_HARNESS_PATH } =
      await import('../extension-critical.helpers');
    const { seedReviewVideo } = await import('../support/quick-editor-media-fixture');
    const { translate } = await import('../../../../apps/extension/src/platform/i18n');
    const host = await startHostServer();
    const locale = viewport.width === 1280 ? 'ru' : 'en';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': viewport.width === 1280 ? 'dark' : 'light',
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 4 });
      await page.reload();
      const open = async () => {
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      };
      await open();
      const button = (key: Parameters<typeof translate>[0]) =>
        page.locator('dialog').getByRole('button', { name: label(key), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.scene').click();
      await button('gallery.videoReview.backgroundGradient').click();
      // Finish the paint edit before testing blur as a separate undo operation.
      await button('gallery.videoReview.back').click();
      await expect(page.locator('[data-ui="gallery.videoReview.enter"]')).toBeVisible();
      await page.reload();
      await open();
      await button('gallery.videoReview.scene').click();
      const field = page.getByRole('textbox', {
        name: label('editor.scene.backgroundBlurAmount'),
        exact: true,
      });
      await field.fill('12');
      await field.press('Enter');
      const raster = page.locator('[data-ui="gallery.videoReview.backgroundBlur"]');
      await expect(raster).toBeVisible();
      await button('gallery.videoReview.undo').click();
      await expect(field).toHaveValue('0');
      await expect(raster).toHaveCount(0);
      await button('gallery.videoReview.redo').click();
      await expect(field).toHaveValue('12');
      await expect(raster).toBeVisible();
      await field.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('background-blur-control.png'),
        fullPage: false,
      });
      await button('gallery.videoReview.back').click();
      await expect(page.locator('[data-ui="gallery.videoReview.enter"]')).toBeVisible();
      await page.reload();
      await open();
      await button('gallery.videoReview.scene').click();
      await expect(field).toHaveValue('12');
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
