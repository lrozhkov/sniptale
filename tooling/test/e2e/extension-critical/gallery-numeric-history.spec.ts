import { expect, test } from '@playwright/test';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { translate } from '../support/catalog-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Gallery numeric gestures retain separate Undo actions ${viewport.name}`, async ({
    page,
  }, info) => {
    const host = await startHostServer();
    try {
      await page.setViewportSize(viewport.size);
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': 'en' },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const advanced = page.getByRole('button', {
        name: translate('gallery.videoReview.advancedEditing', 'en'),
        exact: true,
      });
      if ((await advanced.getAttribute('aria-pressed')) !== 'true') await advanced.click();
      await page
        .getByRole('button', {
          name: translate('gallery.videoReview.audioOriginal', 'en'),
          exact: true,
        })
        .click();
      await page.getByRole('tab', { name: 'Settings', exact: true }).click();
      const volume = page.getByRole('textbox', { name: 'Volume', exact: true });
      const increase = page.getByRole('button', { name: 'Volume increase', exact: true });
      const undo = page.getByRole('button', { name: 'Undo change', exact: true });
      const redo = page.getByRole('button', { name: 'Redo change', exact: true });
      await expect(volume).toHaveValue('100');
      await volume.hover();
      await increase.hover();
      await page.mouse.down();
      await expect.poll(async () => Number(await volume.inputValue())).toBeGreaterThanOrEqual(103);
      await page.mouse.up();
      const first = Number(await volume.inputValue());
      // Start the second hold at the same control without blur, navigation or an autosave wait.
      await page.mouse.down();
      await page.mouse.up();
      await expect.poll(async () => Number(await volume.inputValue())).toBeGreaterThan(first);
      const second = Number(await volume.inputValue());
      for (const value of [first, 100]) {
        await expect(undo).toBeEnabled();
        await undo.click();
        await expect(volume).toHaveValue(String(value));
      }
      for (const value of [first, second]) {
        await expect(redo).toBeEnabled();
        await redo.click();
        await expect(volume).toHaveValue(String(value));
      }
      await undo.click();
      await expect(volume).toHaveValue(String(first));
      await volume.hover();
      await increase.hover();
      await page.mouse.down();
      await expect
        .poll(async () => Number(await volume.inputValue()))
        .toBeGreaterThanOrEqual(first + 3);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(volume).toHaveValue(String(first));
      await expect(redo).toBeEnabled();
      await redo.click();
      await expect(volume).toHaveValue(String(second));
      await undo.click();
      await expect(volume).toHaveValue(String(first));
      await volume.hover();
      await increase.hover();
      await page.mouse.down();
      await expect
        .poll(async () => Number(await volume.inputValue()))
        .toBeGreaterThanOrEqual(first + 3);
      await page.mouse.up();
      const branch = Number(await volume.inputValue());
      await expect(redo).toBeDisabled();
      await undo.click();
      await expect(volume).toHaveValue(String(first));
      await redo.click();
      await expect(volume).toHaveValue(String(branch));
      await page.screenshot({
        path: info.outputPath('separate-volume-history.png'),
        fullPage: false,
      });
    } finally {
      host.server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
