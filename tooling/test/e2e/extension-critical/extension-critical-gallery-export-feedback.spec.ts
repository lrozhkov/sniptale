import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en', theme: 'light' },
  { locale: 'ru', theme: 'dark' },
  { locale: 'en', theme: 'light', viewport: { width: 1200, height: 560 } },
] as const) {
  test(`export feedback locks editing and playback and releases after completion/cancel/error (${variant.locale}${'viewport' in variant ? ', narrow' : ''})`, async ({
    page,
  }, info) => {
    if ('viewport' in variant) await page.setViewportSize(variant.viewport);
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('dialog');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
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
      await seedReviewVideo(page, 'review-cut-vfr.webm', { width: 160, height: 90, duration: 6 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await button('gallery.videoReview.scene').click();
      await button('gallery.videoReview.backgroundSolid').click();
      // Hold the real encoder flush so every busy state can be inspected deterministically.
      await page.evaluate(() => {
        const flush = VideoEncoder.prototype.flush;
        VideoEncoder.prototype.flush = async function () {
          await flush.call(this);
          document.body.dataset.exportHeld = 'true';
          await new Promise<void>((resolve, reject) => {
            window.addEventListener(
              'release-review-export',
              () => {
                document.body.dataset.exportHeld = 'false';
                if (document.body.dataset.exportFailure === 'true')
                  reject(new Error('Test encoder flush failure'));
                else resolve();
              },
              { once: true }
            );
          });
        };
      });
      const video = dialog.locator('video').first();
      for (const outcome of ['complete', 'cancel', 'error'] as const) {
        if (outcome === 'cancel') {
          await button('gallery.videoReview.scene').click();
          await expect(dialog.getByRole('progressbar')).toHaveCount(0);
          const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
          const box = (await ruler.boundingBox())!;
          await page.mouse.move(box.x + box.width * 0.2, box.y + 12);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.7, box.y + 12, { steps: 8 });
          await page.mouse.up();
        } else await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
        await button('gallery.videoReview.play').click();
        await expect
          .poll(() => video.evaluate((node) => node instanceof HTMLVideoElement && !node.paused))
          .toBe(true);
        const start =
          outcome === 'cancel'
            ? button('gallery.videoReview.downloadSelection')
            : button('gallery.videoReview.exportVideo');
        await expect(start).toBeEnabled();
        await start.click();
        await expect(dialog.locator('[data-ui="gallery.videoReview.exportSection"]')).toBeVisible();
        await expect(dialog.getByRole('progressbar')).toBeVisible();
        await expect(button('gallery.videoReview.play')).toBeDisabled();
        await expect(button('gallery.videoReview.cutMode')).toBeDisabled();
        await expect(button('gallery.videoReview.advancedEditing')).toBeDisabled();
        await expect
          .poll(() => video.evaluate((node) => node instanceof HTMLVideoElement && node.paused))
          .toBe(true);
        await page.keyboard.press('Space');
        await expect
          .poll(() => video.evaluate((node) => node instanceof HTMLVideoElement && node.paused))
          .toBe(true);
        await expect(page.locator('body')).toHaveAttribute('data-export-held', 'true');
        await dialog.locator('.review-inspector-scroll').evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        await expect(dialog.getByRole('progressbar')).toBeInViewport();
        await expect(button('gallery.videoReview.cancelExport')).toBeInViewport();
        if (outcome === 'complete')
          await page.screenshot({ path: info.outputPath('export-progress.png'), fullPage: false });
        if (outcome === 'cancel') await button('gallery.videoReview.cancelExport').click();
        await page.evaluate((outcome) => {
          document.body.dataset.exportFailure = String(outcome === 'error');
          window.dispatchEvent(new Event('release-review-export'));
        }, outcome);
        if (outcome === 'complete') {
          await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
          await expect(
            dialog.getByRole('status').filter({ hasText: label('gallery.videoReview.exportAdded') })
          ).toBeVisible();
          await expect(button('gallery.videoReview.openExportInLibrary')).toBeInViewport();
          await expect(dialog.locator('[data-ui="video.exportTimeEstimate"]')).toHaveCount(0);
          await expect(button('gallery.videoReview.cancelExport')).toHaveCount(0);
          await page.screenshot({ path: info.outputPath('export-completed.png'), fullPage: false });
        } else await expect(dialog.getByRole('progressbar')).toHaveCount(0);
        await expect(button('gallery.videoReview.play')).toBeEnabled();
        await expect(button('gallery.videoReview.advancedEditing')).toBeEnabled();
        await expect(button('gallery.videoReview.exportVideo')).toBeEnabled();
        if (outcome === 'error')
          await expect(
            dialog.getByRole('alert').filter({ hasText: label('gallery.videoReview.exportFailed') })
          ).toBeVisible();
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

for (const viewport of [
  { width: 1920, height: 900 },
  { width: 1280, height: 560 },
  { width: 1200, height: 560 },
]) {
  test(`selected fragment is available from ordinary export menu ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const locale = viewport.width === 1280 ? 'ru' : 'en';
    const theme = locale === 'ru' ? 'dark' : 'light';
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    const host = await startHostServer();
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: { 'sniptale-locale-preference': locale, 'sniptale-theme-preference': theme },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const open = dialog.locator('[data-ui="gallery.videoReview.openExport"]');
      const actions = dialog.locator('[data-ui="gallery.videoReview.exportActions"]');
      const fragment = actions.getByRole('button', {
        name: label('gallery.videoReview.exportSelection'),
        exact: true,
      });
      await open.click();
      await expect(fragment).toHaveCount(0);
      const ruler = dialog.locator('[data-ui="gallery.videoReview.ruler"]');
      const box = (await ruler.boundingBox())!;
      await page.mouse.move(box.x + box.width * 0.2, box.y + 12);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + 12, { steps: 8 });
      await page.mouse.up();
      if (!(await fragment.isVisible())) await open.click();
      await expect(fragment).toBeEnabled();
      await expect(
        actions.getByRole('button', { name: label('gallery.videoReview.exportVideo'), exact: true })
      ).toBeEnabled();
      await expect(
        actions.getByRole('button', {
          name: label('gallery.videoReview.downloadVideo'),
          exact: true,
        })
      ).toBeEnabled();
      await fragment.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('fragment-export-actions.png'),
        fullPage: false,
      });
      const download = page.waitForEvent('download');
      await fragment.click();
      expect((await download).suggestedFilename()).toContain('fragment-');
      await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.advancedEditing'), exact: true })
        .click();
      if (!(await fragment.isVisible())) await open.click();
      await expect(fragment).toBeEnabled();
      await fragment.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('advanced-fragment-export-actions.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
