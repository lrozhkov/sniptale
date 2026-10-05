import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo, persistedFocus } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`inspector framing includes following background and tracks playback in ${variant.locale}/${variant.theme}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      const field = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('textbox', { name: label(key), exact: true });
      const setNumber = async (key: Parameters<typeof translate>[0], value: string) => {
        await field(key).fill(value);
        await field(key).press('Enter');
      };
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.scene').click();
      await button('gallery.videoReview.backgroundSolid').click();
      await setNumber('gallery.videoReview.backgroundPadding', '20');
      await button('gallery.videoReview.zoomAdd').click();
      await setNumber('gallery.videoReview.zoomScale', '1.25');
      await dialog
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.precisePosition') })
        .click();
      await setNumber('gallery.videoReview.zoomFocusX', '10');
      const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      const area = preview.locator('[data-focus-frame]');
      const width = () => area.evaluate((node: HTMLElement) => Number.parseFloat(node.style.width));
      const left = () => area.evaluate((node: HTMLElement) => Number.parseFloat(node.style.left));
      await expect(preview).toHaveAttribute('data-status', 'ready');
      await expect.poll(width).toBeCloseTo(400 / 9, 3);
      await expect
        .poll(async () => (await persistedFocus(page))?.transform)
        .toEqual({ scale: 1.25, centerX: 0.1, centerY: 0.5 });
      const before = (await persistedFocus(page))!;
      const sceneMode = async (follow: boolean, padding: string) => {
        await button('gallery.videoReview.scene').click();
        await button('gallery.videoReview.backgroundZoom').click();
        await page
          .getByRole('option', {
            name: label(
              follow
                ? 'gallery.videoReview.backgroundZoomFollow'
                : 'gallery.videoReview.backgroundZoomFixed'
            ),
            exact: true,
          })
          .click();
        await setNumber('gallery.videoReview.backgroundPadding', padding);
        await button('gallery.videoReview.zoomRegionLabel').click();
        await expect(preview).toHaveAttribute('data-status', 'ready');
      };
      await sceneMode(true, '20');
      await expect.poll(width).toBeCloseTo(80, 3);
      await expect.poll(left).toBeCloseTo(40 / 9, 3);
      await sceneMode(true, '30');
      await expect.poll(width).toBeCloseTo(80, 3);
      await expect.poll(left).toBeCloseTo(20 / 3, 3);
      await sceneMode(false, '20');
      await expect.poll(width).toBeCloseTo(400 / 9, 3);
      await sceneMode(true, '20');
      await expect.poll(() => persistedFocus(page)).toEqual(before);
      await preview.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('framing-follow-video.png'), fullPage: false });
      // Background pixels are inside the framing rectangle and must not click-to-place.
      const box = (await preview.locator('canvas').boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.12, box.y + box.height / 2);
      await expect.poll(() => persistedFocus(page)).toEqual(before);
      const video = dialog.locator('video');
      await video.evaluate((node) => {
        node.currentTime = 0;
      });
      await button('gallery.videoReview.play').click();
      await expect(preview).toHaveAttribute('data-playing', 'true');
      await expect.poll(() => video.evaluate((node) => node.currentTime)).toBeGreaterThan(0.1);
      await expect.poll(width).toBeLessThan(99);
      const pixels = () => preview.locator('canvas').evaluate((node) => node.toDataURL());
      const first = await pixels();
      await expect.poll(pixels).not.toBe(first);
      await button('gallery.videoReview.scene').click();
      await expect(preview).toHaveCount(0);
      await button('gallery.videoReview.zoomRegionLabel').click();
      await expect(preview).toHaveAttribute('data-playing', 'true');
      await expect.poll(() => video.evaluate((node) => node.currentTime)).toBeGreaterThan(2.2);
      await expect.poll(width).toBeCloseTo(100, 3);
      await button('gallery.videoReview.pause').click();
      await expect(preview).toHaveAttribute('data-playing', 'false');
      await expect.poll(width).toBeCloseTo(80, 3);
      await expect.poll(() => persistedFocus(page)).toEqual(before);
      await button('gallery.videoReview.zoomPreviewResult').click();
      await expect(area).toHaveCount(0);
      await button('gallery.videoReview.zoomPreviewArea').click();
      await expect.poll(width).toBeCloseTo(80, 3);
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect(preview).toHaveAttribute('data-status', 'ready');
      await expect.poll(width).toBeCloseTo(80, 3);
      await expect.poll(() => persistedFocus(page)).toEqual(before);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
