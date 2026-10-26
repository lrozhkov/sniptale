import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { addReviewFocus, seedReviewVideo } from '../support/quick-editor-media-fixture';
import { readNativeReviewWorkspace } from '../support/native-review-workspace';
import { persistedReviewContent } from '../support/voiceover-speech-fixture';

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'light', title: 'Главная мысль' },
  { width: 1920, height: 900, locale: 'en', theme: 'dark', title: 'Main idea' },
] as const) {
  test(`annotation attachment remains editable in perspective at ${variant.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    const host = await startHostServer();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    const dialog = page.locator('[data-ui="gallery.videoReview.dialog"]');
    const button = (key: Parameters<typeof translate>[0]) =>
      dialog.getByRole('button', { name: label(key), exact: true });
    const workspace = () => readNativeReviewWorkspace(page, 'recording:beta-v1-recording');
    const instance = async () =>
      (await persistedReviewContent(page))?.annotationEffects?.instances[0];
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
          sniptale_quick_preview_preferences: {
            rasterPreset: '360p',
            frameRate: '30',
            pausedQuality: 'same',
            showFrameRate: false,
          },
        },
      });
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', variant.theme);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', { width: 160, height: 90, duration: 12 });
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await button('gallery.videoReview.advancedEditing').click();
      await expect.poll(async () => (await persistedReviewContent(page))?.zoom.enabled).toBe(true);
      await addReviewFocus(page);
      await button('gallery.videoReview.spatialToolTilt').click();
      const tilt = dialog.getByRole('textbox', {
        name: label('gallery.videoReview.perspectiveY'),
        exact: true,
      });
      await tilt.fill('-30');
      await tilt.press('Enter');
      await dialog
        .locator('[data-review-header-track="annotationEffects"] [data-review-track-select]')
        .click();
      await button('gallery.videoReview.annotationEffectsAdd').click();
      await button('gallery.videoReview.annotationEffectsChoose').click();
      await page.getByRole('option', { name: variant.title, exact: true }).click();
      const lane = dialog.locator('[data-ui="gallery.videoReview.annotationEffectsLane"]');
      await lane.scrollIntoViewIfNeeded();
      const box = (await lane.boundingBox())!;
      await page.mouse.move(box.x + box.width / 12, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + (box.width * 7) / 12, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await button('gallery.videoReview.pointerTool').click();
      await dialog.locator('[data-annotation-effect-id]').first().click();
      await dialog
        .locator('[data-ui="gallery.videoReview.stage"] video')
        .first()
        .evaluate((video: HTMLVideoElement) => {
          video.currentTime = 1.5;
        });
      await expect.poll(async () => (await instance())?.attachment).toBe('content');
      await expect(
        dialog.locator('[data-ui="gallery.videoReview.manualPreview"] canvas')
      ).toBeVisible();
      await expect(
        dialog.getByText(label('gallery.videoReview.previewLoading'), { exact: true })
      ).toHaveCount(0);
      await expect(
        dialog.getByText(label('gallery.videoReview.previewFailed'), { exact: true })
      ).toHaveCount(0);
      const before = (await instance())!;
      const cursor = (await workspace())!.cursor;
      const attachment = button('gallery.videoReview.annotationAttachment');
      if (!(await attachment.isVisible()))
        await button('gallery.videoReview.annotationPlacement').click();
      await attachment.scrollIntoViewIfNeeded();
      await attachment.click();
      const viewport = page.getByRole('option', {
        name: label('gallery.videoReview.annotationViewportAttachment'),
        exact: true,
      });
      await expect(viewport).toBeEnabled();
      await viewport.click();
      await expect.poll(async () => (await instance())?.attachment).toBe('viewport');
      const after = (await instance())!;
      expect(after).toMatchObject({
        id: before.id,
        snapshotId: before.snapshotId,
        start: before.start,
        end: before.end,
        controls: before.controls,
      });
      expect((await workspace())!.cursor).toBe(cursor + 1);
      await expect(attachment).toHaveText(
        label('gallery.videoReview.annotationViewportAttachment')
      );
      await page.screenshot({
        path: info.outputPath('annotation-viewport-in-perspective.png'),
        fullPage: false,
      });
      await button('gallery.videoReview.undo').click();
      await expect.poll(instance).toEqual(before);
      await button('gallery.videoReview.redo').click();
      await expect.poll(instance).toEqual(after);
      await attachment.click();
      await page
        .getByRole('option', {
          name: label('gallery.videoReview.annotationContentAttachment'),
          exact: true,
        })
        .click();
      await expect.poll(async () => (await instance())?.attachment).toBe('content');
      const back = (await instance())!;
      expect((await workspace())!.cursor).toBe(cursor + 2);
      await dialog
        .locator('header')
        .getByRole('button', { name: label('common.actions.close'), exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await dialog.locator('[data-annotation-effect-id]').first().click();
      await expect.poll(instance).toEqual(back);
      if (!(await attachment.isVisible()))
        await button('gallery.videoReview.annotationPlacement').click();
      await expect(attachment).toHaveText(label('gallery.videoReview.annotationContentAttachment'));
      expect(errors).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
