import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo, persistedFocus } from '../support/quick-editor-media-fixture';

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`quick editor fullscreen retains its video and edits focus (${variant.locale}${'viewport' in variant ? ', narrow' : ''})`, async ({
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: label(key), exact: true });
      const toggle = dialog.locator('[data-ui="gallery.videoReview.fullscreen"]');
      const video = dialog.locator('[data-ui="gallery.videoReview.stage"] video');
      await video.evaluate((node) => {
        node.dataset['identityProof'] = 'original';
      });
      // Basic viewing uses the same frame and returns to the still-open Gallery editor.
      await toggle.click();
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-ui')))
        .toBe('gallery.videoReview.previewFrame');
      await expect(video).toHaveAttribute('data-identity-proof', 'original');
      await toggle.click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await expect(toggle).toBeFocused();
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.scene').click();
      await button('gallery.videoReview.windowHeader').click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.windowHeaderBrowser'),
          exact: true,
        })
        .click();
      await button('gallery.videoReview.zoomAdd').click();
      await button('gallery.videoReview.focusRangeTool').click();
      const tools = dialog.locator('[data-ui="gallery.videoReview.editingTools"]');
      await tools
        .getByRole('button', { name: label('gallery.videoReview.focusType'), exact: true })
        .click();
      await page
        .getByRole('option', { name: label('gallery.videoReview.focusBorder'), exact: true })
        .click();
      await button('gallery.videoReview.zoomAdd').click();
      await expect.poll(async () => !!(await persistedFocus(page))?.border).toBe(true);
      await page.screenshot({ path: info.outputPath('normal-preview.png'), fullPage: false });
      await toggle.click();
      const transport = dialog.locator('[data-ui="gallery.videoReview.fullscreenTransport"]');
      await expect(transport).toBeVisible();
      await expect(video).toHaveAttribute('data-identity-proof', 'original');
      await expect(video).toHaveCount(1);
      const seek = transport.locator('input[type="range"]');
      await seek.evaluate((node: HTMLInputElement) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          node,
          '0.5'
        );
        node.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeCloseTo(0.5, 1);
      const target = dialog.locator('[data-ui="gallery.videoReview.focusPick"]');
      await expect(target).toHaveCount(2);
      const cameraTarget = target.and(
        dialog.getByRole('button', {
          name: label('gallery.videoReview.zoomRegionLabel'),
          exact: true,
        })
      );
      await cameraTarget.focus();
      await cameraTarget.press('Enter');
      await expect(dialog.locator('[data-ui="gallery.videoReview.zoomTarget"]')).toHaveCount(1);
      await target
        .and(
          dialog.getByRole('button', {
            name: label('gallery.videoReview.focusBorder'),
            exact: true,
          })
        )
        .click();
      await expect
        .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeCloseTo(1, 1);
      const frame = dialog.locator('[data-ui="gallery.videoReview.stage"] [data-focus-frame]');
      await expect(frame).toHaveCount(1);
      const before = (await persistedFocus(page))!.border!.area.x;
      const box = await frame.boundingBox();
      if (!box) throw new Error('Selected focus has no stage bounds');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
      await expect
        .poll(async () => (await persistedFocus(page))?.border?.area.x ?? 0)
        .toBeGreaterThan(before);
      await page.screenshot({ path: info.outputPath('fullscreen-focus.png'), fullPage: false });
      await transport
        .getByRole('button', { name: label('gallery.videoReview.play'), exact: true })
        .click();
      await expect(frame).toHaveCount(0);
      await expect(dialog.locator('[data-ui="gallery.videoReview.focusPick"]')).toHaveCount(0);
      await expect.poll(() => video.evaluate((node: HTMLVideoElement) => !node.paused)).toBe(true);
      await transport
        .getByRole('button', { name: label('gallery.videoReview.pause'), exact: true })
        .click();
      await toggle.focus();
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await expect(dialog).toBeVisible();
      await expect(toggle).toBeFocused();
      await expect(video).toHaveAttribute('data-identity-proof', 'original');
      await page.screenshot({ path: info.outputPath('fullscreen-return.png'), fullPage: false });
    } finally {
      await page.evaluate(async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
      });
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
