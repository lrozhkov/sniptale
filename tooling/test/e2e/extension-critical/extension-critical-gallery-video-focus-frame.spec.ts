import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo, persistedFocus } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor Focus area corners and hover at HD (${variant.locale}/${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
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
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.zoomAdd').first().click();
      const type = dialog.locator('[data-ui="gallery.videoReview.focusType"]');
      await expect(type.getByRole('button')).toHaveCount(2);
      const preview = dialog.locator('[data-ui="gallery.videoReview.zoomPreview"]');
      await expect(preview).toHaveAttribute('data-status', 'ready');
      const frame = preview.locator('[data-focus-frame]');
      await expect
        .poll(async () => (await persistedFocus(page))?.transform.scale)
        .toBeGreaterThan(1);
      const initial = (await persistedFocus(page))!.transform;
      for (const corner of ['nw', 'ne', 'sw', 'se']) {
        const before = (await persistedFocus(page))!.transform;
        await frame.hover();
        const grip = frame.locator(`[data-resize="${corner}"]`);
        await expect(grip).toHaveCSS(
          'cursor',
          corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize'
        );
        await expect(grip).toHaveCSS('opacity', '1');
        const box = (await grip.boundingBox())!;
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(
          x + (corner.endsWith('w') ? 8 : -8),
          y + (corner.startsWith('n') ? 5 : -5),
          { steps: 5 }
        );
        await page.mouse.up();
        await expect
          .poll(async () => (await persistedFocus(page))?.transform.scale)
          .toBeGreaterThan(before.scale);
        await button('gallery.videoReview.undo').click();
        await expect
          .poll(async () => (await persistedFocus(page))?.transform.scale)
          .toBeCloseTo(before.scale);
      }
      await frame.hover();
      const grip = frame.locator('[data-resize="se"]');
      const box = (await grip.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(5, 5);
      await expect(frame).toHaveAttribute('data-controls-visible', 'true');
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(frame).toHaveAttribute('data-controls-visible', 'false');
      await expect(grip).toHaveCSS('opacity', '0');
      await expect.poll(async () => (await persistedFocus(page))?.transform).toEqual(initial);
      const canvas = preview.locator('canvas');
      await button('gallery.videoReview.zoomPreviewResult').click();
      await expect(frame).toHaveCount(0);
      await button('gallery.videoReview.zoomPreviewArea').click();
      await canvas.focus();
      await page.keyboard.press('ArrowRight');
      await expect(frame.locator('[data-resize="nw"]')).toHaveCSS('opacity', '1');
      await button('gallery.videoReview.undo').click();
      await type
        .getByRole('button', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
        .click();
      await expect(frame).toHaveAttribute('role', 'group');
      await expect(frame.locator('[data-resize]')).toHaveCount(4);
      await frame.hover();
      const nw = frame.locator('[data-resize="nw"]');
      const spotBox = (await nw.boundingBox())!;
      await page.mouse.move(spotBox.x + spotBox.width / 2, spotBox.y + spotBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(spotBox.x - 8, spotBox.y - 5, { steps: 5 });
      await page.mouse.up();
      await expect
        .poll(async () => (await persistedFocus(page))?.spotlight?.area.width)
        .toBeGreaterThan(0.5);
      const saved = (await persistedFocus(page))!.spotlight;
      await page.mouse.move(5, 5);
      await expect(frame).toHaveAttribute('data-controls-visible', 'false');
      await expect(nw).toHaveCSS('opacity', '0');
      await frame.hover();
      await expect(nw).toHaveCSS('opacity', '1');
      await page.screenshot({
        path: testInfo.outputPath(`focus-frame-${variant.locale}-${variant.theme}.png`),
      });
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog
        .locator('[data-ui="gallery.videoReview.zoomLane"] [role="button"]')
        .first()
        .click();
      await expect(
        type.getByRole('button', { name: label('gallery.videoReview.focusSpotlight'), exact: true })
      ).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await persistedFocus(page))?.spotlight).toEqual(saved);
      await button('gallery.videoReview.undo').click();
      await expect
        .poll(async () => (await persistedFocus(page))?.spotlight?.area.width)
        .toBeCloseTo(0.5);
      await dialog
        .locator('summary')
        .filter({ hasText: label('gallery.videoReview.preciseArea') })
        .click();
      for (const key of ['focusAreaWidth', 'focusAreaHeight'] as const) {
        const input = dialog.getByRole('textbox', {
          name: label(`gallery.videoReview.${key}`),
          exact: true,
        });
        await input.fill('1');
        await input.press('Enter');
      }
      await expect
        .poll(async () => (await persistedFocus(page))?.spotlight?.area.width)
        .toBeCloseTo(0.01);
      await frame.hover();
      const grips = await frame.locator('[data-resize]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const bounds = node.getBoundingClientRect();
          return {
            corner: node.getAttribute('data-resize'),
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
          };
        })
      );
      const nwBounds = grips.find((item) => item.corner === 'nw')!;
      const neBounds = grips.find((item) => item.corner === 'ne')!;
      const swBounds = grips.find((item) => item.corner === 'sw')!;
      expect(nwBounds.right).toBeLessThanOrEqual(neBounds.left + 0.1);
      expect(nwBounds.bottom).toBeLessThanOrEqual(swBounds.top + 0.1);
      await button('gallery.videoReview.back').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
