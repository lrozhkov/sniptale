import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`new note completes before the chosen action at HD (${variant.locale}/${variant.theme})`, async ({
    page,
  }) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    const field = dialog.getByRole('textbox', {
      name: label('gallery.videoReview.commentText'),
      exact: true,
    });
    const rows = dialog.locator('.review-inspector-list > li');
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
      await button('gallery.videoReview.addComment').first().click();
      await field.fill('Existing note');
      await button('gallery.videoReview.save').click();
      await button('gallery.videoReview.addComment').first().click();
      await field.fill('Automatic note');
      await page.keyboard.press('Tab');
      await expect(field).toBeVisible();
      await rows.first().hover();
      await rows
        .first()
        .getByRole('button', { name: label('gallery.videoReview.editComment'), exact: true })
        .click();
      await expect(rows).toHaveCount(2);
      await expect(field).toHaveValue('Existing note');
      await button('gallery.videoReview.discard').click();
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.addComment').first().click();
      await field.fill('Before Scene');
      await button('gallery.videoReview.scene').click();
      await expect(field).toHaveCount(0);
      await expect(button('gallery.videoReview.scene')).toHaveAttribute('aria-pressed', 'true');
      await button('gallery.videoReview.addComment').first().click();
      await field.fill('Before Export');
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await expect(dialog.locator('[data-ui="gallery.videoReview.exportSection"]')).toBeVisible();
      await expect(field).toHaveCount(0);
      await button('gallery.videoReview.addComment').first().click();
      await field.fill('Before keyboard seek');
      await dialog.locator('[data-ui="gallery.videoReview.timePlane"]').focus();
      await page.keyboard.press('End');
      await expect(field).toHaveCount(0);
      await button('gallery.videoReview.addComment').first().click();
      await field.fill('Before Back');
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.comments').click();
      await expect(rows).toHaveCount(6);
      for (const text of [
        'Existing note',
        'Automatic note',
        'Before Scene',
        'Before Export',
        'Before keyboard seek',
        'Before Back',
      ]) {
        await expect(rows.filter({ hasText: text })).toHaveCount(1);
      }
      await button('gallery.videoReview.addComment').first().click();
      await field.fill('   ');
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.comments').click();
      await expect(rows).toHaveCount(6);
      await button('gallery.videoReview.back').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
