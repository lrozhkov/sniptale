import { expect, test, type Locator } from '@playwright/test';
import { startHostServer } from '../support/host-server';
import { addReviewFocus, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { translate } from '../../../../apps/extension/src/platform/i18n';

/** Compare the visible interior against the painted source, where focus controls and masks do not cover it. */
async function expectVisibleSource(preview: Locator) {
  await expect(preview).toHaveAttribute('data-status', 'ready');
  const canvas = preview.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  await expect
    .poll(
      async () => {
        const screenshot = await canvas.screenshot();
        return canvas.evaluate(async (source: HTMLCanvasElement, encoded) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const visible = document.createElement('canvas');
          visible.width = image.width;
          visible.height = image.height;
          const context = visible.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const original = source.getContext('2d')!;
          let error = 0,
            chroma = 0;
          for (const [x, y] of [
            [0.44, 0.44],
            [0.56, 0.44],
            [0.44, 0.56],
            [0.56, 0.56],
          ]) {
            const expected = original.getImageData(
              Math.floor(source.width * x!),
              Math.floor(source.height * y!),
              1,
              1
            ).data;
            const actual = context.getImageData(
              Math.floor(image.width * x!),
              Math.floor(image.height * y!),
              1,
              1
            ).data;
            chroma += Math.max(...expected.slice(0, 3)) - Math.min(...expected.slice(0, 3));
            for (let channel = 0; channel < 3; channel++)
              error += Math.abs(expected[channel]! - actual[channel]!);
          }
          return { paintedSource: chroma > 100, visibleSource: error / 12 < 20 };
        }, screenshot.toString('base64'));
      },
      { message: 'The painted video must remain visible above the scene background' }
    )
    .toEqual({ paintedSource: true, visibleSource: true });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Focus inspector source stays visible (${theme})`, async ({ page }, info) => {
    const host = await startHostServer();
    const dialog = page.locator('dialog');
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': theme },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await addReviewFocus(page);
      const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      const types = dialog.locator('[data-ui="gallery.videoReview.focusType"]');
      for (const background of ['none', 'gradient'] as const) {
        if (background === 'gradient') {
          await button('gallery.videoReview.scene').click();
          await button('gallery.videoReview.backgroundGradient').click();
          const padding = dialog.getByRole('textbox', {
            name: label('gallery.videoReview.backgroundPadding'),
            exact: true,
          });
          await padding.fill('8');
          await padding.press('Enter');
          await dialog
            .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
            .first()
            .click();
        }
        for (const kind of ['zoomRegionLabel', 'focusBorder', 'focusSpotlight'] as const) {
          await types
            .getByRole('button', { name: label(`gallery.videoReview.${kind}`), exact: true })
            .click();
          await expectVisibleSource(preview);
          if (kind !== 'zoomRegionLabel') {
            await button('gallery.videoReview.play').click();
            await button('gallery.videoReview.pause').click();
            await dialog
              .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
              .first()
              .click();
            await expectVisibleSource(preview);
          }
          await page.screenshot({
            path: info.outputPath(`${background}-${kind}.png`),
            fullPage: false,
          });
        }
      }
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
