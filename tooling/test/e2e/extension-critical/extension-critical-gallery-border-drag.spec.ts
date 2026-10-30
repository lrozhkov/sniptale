import { expect, test } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import {
  addReviewFocus,
  seedReviewVideo,
  persistedFocus,
} from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`border positioning commits and cancels across preview surfaces (${viewport.name})`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const label = (key: Parameters<typeof translate>[0]) => translate(key, 'en');
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    try {
      await page.setViewportSize(viewport.size);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'light' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=light`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await addReviewFocus(page);
      await button('gallery.videoReview.focusBorder').click();
      await expect.poll(async () => !!(await persistedFocus(page))?.border).toBe(true);
      const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      await expect(preview).toHaveAttribute('data-status', 'ready');
      const published = dialog.locator('[data-ui="gallery.videoReview.stage"]');
      const pixels = async () => (await published.screenshot()).toString('base64');
      await expect(published).toBeVisible();
      const initial = (await persistedFocus(page))!.border!.area;
      let saved = initial;
      for (const surface of ['stage', 'area'] as const) {
        const target =
          surface === 'stage'
            ? dialog
                .locator(
                  '[data-ui="gallery.videoReview.stage"] [data-ui="gallery.videoReview.focusArea"] [data-focus-frame]'
                )
                .first()
            : preview
                .locator('[data-ui="gallery.videoReview.focusArea"] [data-focus-frame]')
                .first();
        await target.scrollIntoViewIfNeeded();
        const box = (await target.boundingBox())!;
        const x = box.x + box.width * 0.55,
          y = box.y + box.height * 0.55;
        const before = (await persistedFocus(page))!.border!.area;
        await page.mouse.move(x, y);
        const beforePixels = await pixels();
        await page.mouse.down();
        await page.mouse.move(x - 24, y - 8, { steps: surface === 'stage' ? 160 : 12 });
        await expect.poll(pixels).not.toBe(beforePixels);
        // A draft must not enter history before the pointer is released.
        expect((await persistedFocus(page))!.border!.area).toEqual(before);
        await page.mouse.up();
        await expect
          .poll(async () => (await persistedFocus(page))?.border?.area)
          .not.toEqual(before);
        saved = (await persistedFocus(page))!.border!.area;
        await expect(preview).toHaveAttribute('data-status', 'ready');
        await page.screenshot({ path: info.outputPath(`border-${surface}.png`), fullPage: false });
        await button('gallery.videoReview.undo').click();
        await expect.poll(async () => (await persistedFocus(page))?.border?.area).toEqual(before);
        await button('gallery.videoReview.redo').click();
        await expect.poll(async () => (await persistedFocus(page))?.border?.area).toEqual(saved);
        await target.scrollIntoViewIfNeeded();
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 16, y + 4, { steps: 8 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect.poll(async () => (await persistedFocus(page))?.border?.area).toEqual(saved);
      }
      const frame = preview.locator('[data-focus-frame]').first();
      const grip = frame.locator('[data-resize="se"]');
      await grip.scrollIntoViewIfNeeded();
      const bounds = (await grip.boundingBox())!;
      const beforeSize = (await persistedFocus(page))!.border!.area;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 - 12, bounds.y + bounds.height / 2 - 8, {
        steps: 24,
      });
      await page.mouse.up();
      await expect
        .poll(async () => (await persistedFocus(page))?.border?.area.width)
        .toBeLessThan(beforeSize.width);
      saved = (await persistedFocus(page))!.border!.area;
      await button('gallery.videoReview.undo').click();
      await expect.poll(async () => (await persistedFocus(page))?.border?.area).toEqual(beforeSize);
      await button('gallery.videoReview.redo').click();
      await expect.poll(async () => (await persistedFocus(page))?.border?.area).toEqual(saved);
      await button('common.actions.close').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect.poll(async () => (await persistedFocus(page))?.border?.area).toEqual(saved);
      await expect(preview).toHaveAttribute('data-status', 'ready');
      expect(pageErrors).toEqual([]);
    } finally {
      await page.close();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
