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
    const libraryBackup = () =>
      page.getByRole('button', { name: label('gallery.app.selectionBackup'), exact: true });
    const more = review.getByRole('button', {
      name: label('gallery.videoReview.moreActions'),
      exact: true,
    });
    const menu = page.getByRole('menu', {
      name: label('gallery.videoReview.moreActions'),
      exact: true,
    });
    const backup = () =>
      menu.getByRole('menuitem', { name: label('gallery.app.selectionBackup'), exact: true });
    const openMenu = async (keyboard = false) => {
      await expect(more).toBeInViewport();
      if (keyboard) {
        await more.focus();
        await page.keyboard.press('ArrowUp');
        await expect(backup()).toBeFocused();
      } else await more.click();
      await expect(menu).toBeVisible();
      await expect(
        menu.getByRole('menuitem', { name: label('videoEditor.app.newProjectAction'), exact: true })
      ).toBeEnabled();
      await expect(
        menu.getByRole('menuitem', { name: label('gallery.keyboard.title'), exact: true })
      ).toBeEnabled();
      await expect(backup()).toBeEnabled();
    };
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
      await libraryBackup().click();
      await expect.poll(async () => (await files()).length).toBe(1);
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(
        review.getByRole('button', { name: label('gallery.app.selectionBackup'), exact: true })
      ).toHaveCount(0);
      await expect(
        review
          .locator('header')
          .getByRole('button', { name: label('videoEditor.app.newProjectAction'), exact: true })
      ).toHaveCount(0);
      await openMenu();
      await page.screenshot({ path: info.outputPath('more-basic.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await expect(more).toBeFocused();
      await expect(review).toBeVisible();
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
        await openMenu();
        await backup().click();
        await expect(
          review.getByRole('status').filter({ hasText: label('gallery.videoReview.backupFailed') })
        ).toBeVisible();
        expect((await files()).length).toBe(1);
      }
      await openMenu(true);
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await files()).length).toBe(2);
      const saved = (await files())[1]!;
      const original = await readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
      expect(JSON.stringify(original?.history)).toContain('Portable current note');
      await review
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      await openMenu();
      await page.screenshot({ path: info.outputPath('more-advanced.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await review.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await expect(review.locator('[data-ui="gallery.videoReview.exportSection"]')).toBeVisible();
      await expect(
        review.getByRole('button', { name: label('gallery.app.selectionBackup'), exact: true })
      ).toHaveCount(0);
      await openMenu();
      await expect(backup()).toBeInViewport();
      await page.screenshot({ path: info.outputPath('more-export.png'), fullPage: false });
      await page.keyboard.press('Escape');
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
