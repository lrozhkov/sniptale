import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const, width: null },
  { locale: 'en' as const, theme: 'dark' as const, width: null },
  { locale: 'ru' as const, theme: 'light' as const, width: 1279 },
  { locale: 'ru' as const, theme: 'dark' as const, width: 1281 },
  { locale: 'en' as const, theme: 'dark' as const, width: 1100 },
]) {
  test(`quick editor dismisses and repeats cut feedback in ${variant.locale}/${variant.theme}/${variant.width ?? 'primary'}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      if (variant.width) await page.setViewportSize({ width: variant.width, height: 560 });
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.cutMode').click();
      const lane = dialog.locator('[data-ui="gallery.videoReview.sourceLane"]');
      const box = (await lane.boundingBox())!;
      await page.mouse.move(box.x + box.width / 6, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await dialog.locator('[data-ui="gallery.videoReview.timePlane"]').press('v');
      const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
      const rulerBox = (await ruler.boundingBox())!;
      await ruler.click({ position: { x: rulerBox.width / 4, y: rulerBox.height / 2 } });
      const zoom = button('gallery.videoReview.zoomAdd');
      await zoom.click();
      const feedback = dialog.locator('[data-ui="gallery.videoReview.feedback"]');
      const dismiss = button('gallery.videoReview.dismissFeedback');
      await expect(feedback).toHaveAttribute('role', 'alert');
      await expect(feedback).toContainText(
        translate('gallery.videoReview.placementOnCut', variant.locale)
      );
      await expect(feedback).toBeInViewport({ ratio: 1 });
      await expect(dismiss).toBeInViewport({ ratio: 1 });
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.zoomLane"] [data-zoom-edge]')
      ).toHaveCount(0);
      const stage = (await dialog.locator('[data-ui="gallery.videoReview.stage"]').boundingBox())!;
      const notice = (await feedback.boundingBox())!;
      expect(notice.y + notice.height).toBeLessThanOrEqual(stage.y);
      await page.screenshot({
        path: info.outputPath(`feedback-${variant.locale}.png`),
        fullPage: false,
      });
      await dismiss.click();
      await expect(feedback).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(zoom).toBeFocused();
      for (const key of [' ', 'Enter', 'Escape']) {
        await zoom.click();
        await expect(feedback).toBeVisible();
        await dismiss.focus();
        await dismiss.press(key);
        await expect(feedback).toHaveCount(0);
        await expect(zoom).toBeFocused();
        await expect(dialog.locator('video').first()).toHaveJSProperty('paused', true);
      }
      await button('gallery.videoReview.originalAudioRange').click();
      const original = dialog.locator('[data-original-audio-lane]');
      await original.scrollIntoViewIfNeeded();
      const originalBox = (await original.boundingBox())!;
      await page.mouse.move(
        originalBox.x + originalBox.width * 0.22,
        originalBox.y + originalBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        originalBox.x + originalBox.width * 0.28,
        originalBox.y + originalBox.height / 2,
        { steps: 5 }
      );
      await page.mouse.up();
      await expect(feedback).toContainText(
        translate('gallery.videoReview.originalAudioCut', variant.locale)
      );
      await expect(feedback).toBeInViewport({ ratio: 1 });
      await dismiss.click();
      await expect(feedback).toHaveCount(0);
      await dialog.locator('[data-ui="gallery.videoReview.timePlane"]').press('v');
      await ruler.click({ position: { x: rulerBox.width * 0.6, y: rulerBox.height / 2 } });
      await zoom.click();
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.zoomLane"] [data-zoom-edge]')
      ).toHaveCount(2);
      await expect(feedback).toHaveCount(0);
      if (variant.width === 1100) {
        await dialog
          .getByRole('slider', {
            name: translate('videoEditor.timeline.zoom', variant.locale),
            exact: true,
          })
          .press('End');
        const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
        expect(await viewport.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        await viewport.evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        await expect(button('gallery.videoReview.back')).toBeInViewport({ ratio: 1 });
      }
      await page.screenshot({ path: info.outputPath('recovered.png'), fullPage: false });
      await button('gallery.videoReview.back').click();
      await expect(dialog).toHaveCount(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
