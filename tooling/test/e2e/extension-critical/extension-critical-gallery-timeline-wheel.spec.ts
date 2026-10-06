import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`timeline wheel zoom preserves drag and contains scroll (${variant.locale}${'viewport' in variant ? ', narrow' : ''})`, async ({
    page,
  }, info) => {
    if ('viewport' in variant) await page.setViewportSize(variant.viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-cut-vfr.webm', { width: 160, height: 90, duration: 6 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const slider = dialog.getByRole('slider', {
        name: label('videoEditor.timeline.zoom'),
        exact: true,
      });
      await page.evaluate(() => {
        document.body.dataset.unhandledWheel = '0';
        document.addEventListener('wheel', () => {
          document.body.dataset.unhandledWheel = String(
            Number(document.body.dataset.unhandledWheel) + 1
          );
        });
        document.addEventListener(
          'wheel',
          (event) =>
            setTimeout(() => {
              document.body.dataset.wheelConsumed = String(event.defaultPrevented);
            }),
          { capture: true }
        );
      });
      await slider.hover();
      await page.mouse.wheel(0, -100);
      await expect(slider).toHaveValue('5');
      await expect(page.locator('body')).toHaveAttribute('data-wheel-consumed', 'true');
      await expect(page.locator('body')).toHaveAttribute('data-unhandled-wheel', '0');
      await page.mouse.wheel(0, 100);
      await expect(slider).toHaveValue('0');
      await slider.focus();
      await slider.press('End');
      await expect(slider).toHaveValue('100');
      await slider.hover();
      await page.mouse.wheel(0, -100);
      await expect(slider).toHaveValue('100');
      await expect(page.locator('body')).toHaveAttribute('data-unhandled-wheel', '0');
      await slider.press('Home');
      const box = (await slider.boundingBox())!;
      await page.mouse.move(box.x + 8, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect.poll(() => slider.inputValue().then(Number)).toBeGreaterThan(50);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.fit'), exact: true })
        .click();
      await expect(slider).toHaveValue('0');
      await slider.hover();
      await page.mouse.wheel(0, -100);
      await expect(slider).toHaveValue('5');
      await expect(page.locator('body')).toHaveAttribute('data-unhandled-wheel', '0');
      await page.screenshot({ path: info.outputPath('timeline-wheel.png'), fullPage: false });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
