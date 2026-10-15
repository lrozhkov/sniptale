import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'dark', autosave: false },
  { width: 1920, height: 900, locale: 'en', theme: 'light', autosave: true },
] as const) {
  test(`explicit library and quick backup restores current work ${variant.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(15_000);
    await page.setViewportSize(variant);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const review = page.locator('[data-ui="gallery.videoReview.dialog"]');
    const backup = () =>
      page.getByRole('button', { name: label('gallery.app.selectionBackup'), exact: true });
    const files = () => page.evaluate(() => window.__sniptaleHarness?.getSavedFiles() ?? []);
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
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 320, height: 180, duration: 4 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await backup().click();
      await expect.poll(async () => (await files()).length).toBe(1);
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(backup()).toBeVisible();
      if (!variant.autosave) {
        await review.locator('[data-ui="autosave-control"] button').first().click();
        await page.getByRole('switch').focus();
        await page.keyboard.press('Space');
        await expect(page.getByRole('switch')).not.toBeChecked();
        await page.keyboard.press('Escape');
      }
      await review
        .getByRole('button', { name: label('gallery.videoReview.addComment'), exact: true })
        .first()
        .click();
      await review
        .getByRole('textbox', { name: label('gallery.videoReview.commentText'), exact: true })
        .fill('Portable current note');
      if (!variant.autosave) {
        await page.evaluate(() => {
          const original = Object.getOwnPropertyDescriptor(window, 'showSaveFilePicker')!;
          Object.defineProperty(window, 'showSaveFilePicker', {
            configurable: true,
            value: async () => {
              Object.defineProperty(window, 'showSaveFilePicker', original);
              throw new DOMException('Fixture file access refused', 'NotAllowedError');
            },
          });
        });
        await backup().click();
        await expect(
          review.getByRole('status').filter({ hasText: label('gallery.videoReview.backupFailed') })
        ).toBeVisible();
        expect((await files()).length).toBe(1);
      }
      await backup().focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await files()).length).toBe(2);
      const saved = (await files())[1]!;
      const original = await readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
      expect(JSON.stringify(original?.history)).toContain('Portable current note');
      await review
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await review.locator('[data-ui="gallery.videoReview.previewSettings"]').click();
      await backup().scrollIntoViewIfNeeded();
      await expect(backup()).toBeInViewport();
      await page.screenshot({ path: info.outputPath('backup-footer.png'), fullPage: false });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      const before = await page.evaluate(async () =>
        (await window.__sniptaleHarness!.getMediaLibraryState()).map((item) => item.id)
      );
      await page.locator('[data-ui="gallery.header.storage"] > button').click();
      await page
        .getByRole('menuitem', { name: label('gallery.app.importBackup'), exact: true })
        .click();
      await page.locator('input[accept=".zip,application/zip"]').setInputFiles({
        name: saved.filename,
        mimeType: 'application/zip',
        buffer: Buffer.from(saved.bytes),
      });
      await page
        .getByRole('button', {
          name: label('gallery.importModal.conflictActionLabel'),
          exact: true,
        })
        .click();
      await page
        .getByRole('option', { name: label('gallery.importModal.duplicateTitle'), exact: true })
        .click();
      await page
        .getByRole('button', { name: label('gallery.importModal.restore'), exact: true })
        .click();
      const newIds = () =>
        page.evaluate(
          async (known) =>
            (await window.__sniptaleHarness!.getMediaLibraryState())
              .map((item) => item.id)
              .filter((id) => !known.includes(id)),
          before
        );
      await expect.poll(newIds).toHaveLength(1);
      const restored = await readNativeReviewWorkspace(page, (await newIds())[0]!);
      expect(restored?.history).toEqual(original?.history);
      expect(restored?.source).toEqual(original?.source);
      expect(restored?.advanced).toEqual(original?.advanced);
    } finally {
      await page.close();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
