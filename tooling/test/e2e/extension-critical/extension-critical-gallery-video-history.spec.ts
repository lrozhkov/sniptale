import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor history start and original reset at HD (${variant.locale}/${variant.theme})`, async ({
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
      const volume = dialog
        .locator('[data-ui="gallery.videoReview.sceneAudio"]')
        .getByRole('textbox', { name: label('gallery.videoReview.audioOriginal'), exact: true });
      for (const value of ['40', '70']) {
        await volume.fill(value);
        await volume.press('Enter');
        // Leaving flushes this debounced edit into its own durable history step.
        await button('gallery.videoReview.back').click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      }
      await expect(volume).toHaveValue('70');
      await button('gallery.videoReview.historyReset').click();
      const choices = dialog.locator('[data-ui="gallery.videoReview.historyChoices"]');
      await expect(choices).toBeVisible();
      await expect(choices).toHaveCSS('opacity', '1');
      expect(await choices.evaluate((node) => getComputedStyle(node).backgroundColor)).toMatch(
        /^rgb\(/
      );
      const bounds = (await choices.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
      await page.screenshot({ path: testInfo.outputPath('history-choices.png') });
      await page.keyboard.press('Escape');
      await expect(choices).toHaveCount(0);
      await expect(button('gallery.videoReview.historyReset')).toBeFocused();
      await expect(volume).toHaveValue('70');
      await button('gallery.videoReview.historyReset').click();
      await choices.locator('[data-history-start]').click();
      await expect(volume).toHaveValue('100');
      await expect(button('gallery.videoReview.undo')).toBeDisabled();
      await expect(button('gallery.videoReview.redo')).toBeEnabled();
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(volume).toHaveValue('100');
      await button('gallery.videoReview.redo').click();
      await expect(volume).toHaveValue('40');
      await button('gallery.videoReview.redo').click();
      await expect(volume).toHaveValue('70');
      await button('gallery.videoReview.historyReset').click();
      await choices.locator('[data-history-original]').click();
      const confirm = dialog.getByRole('alertdialog');
      await expect(confirm).toBeVisible();
      await confirm
        .getByRole('button', { name: label('gallery.videoReview.resetCancel'), exact: true })
        .click();
      await expect(choices).toBeVisible();
      await expect(volume).toHaveValue('70');
      await choices.locator('[data-history-original]').click();
      await confirm
        .getByRole('button', { name: label('gallery.videoReview.resetOriginal'), exact: true })
        .click();
      await expect(confirm).toHaveCount(0);
      await expect(volume).toHaveValue('100');
      await expect(button('gallery.videoReview.redo')).toBeDisabled();
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(volume).toHaveValue('100');
      await expect(button('gallery.videoReview.redo')).toBeDisabled();
      await button('gallery.videoReview.historyReset').click();
      await expect(choices.locator('[data-history-start]')).toBeDisabled();
      await page.keyboard.press('Escape');
      await button('gallery.videoReview.back').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
