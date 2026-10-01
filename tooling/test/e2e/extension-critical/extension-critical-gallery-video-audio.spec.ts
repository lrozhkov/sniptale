import { expect, test, type Page } from '@playwright/test';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`quick editor master volume and mute stay synchronized at HD (${variant.locale}/${variant.theme})`, async ({
    page,
  }, testInfo) => {
    const host = await startHostServer();
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
      const dialog = page.locator('dialog');
      const button = (key: Parameters<typeof translate>[0]) =>
        dialog.getByRole('button', { name: translate(key, variant.locale), exact: true });
      await button('gallery.videoReview.advancedEditing').click();
      const original = dialog.locator('[data-original-audio-lane]');
      const video = dialog.locator('video').first();
      const volume = dialog
        .locator('[data-ui="gallery.videoReview.sceneAudio"]')
        .getByRole('textbox', {
          name: translate('gallery.videoReview.audioOriginal', variant.locale),
          exact: true,
        });
      const change = async (value: string) => {
        await volume.fill(value);
        await volume.press('Enter');
      };
      const sound = async (muted: boolean, gain: number) => {
        await expect
          .poll(() =>
            video.evaluate((node: HTMLVideoElement) => ({ muted: node.muted, volume: node.volume }))
          )
          .toEqual({ muted, volume: gain });
        await expect(original).toHaveAttribute('data-audio-muted', String(muted));
        await expect(
          button(
            muted ? 'gallery.videoReview.restoreSourceAudio' : 'gallery.videoReview.muteSourceAudio'
          )
        ).toHaveAttribute('aria-pressed', String(!muted));
      };
      await change('0');
      await sound(true, 0);
      await expect(original).toHaveCSS('border-bottom-style', 'dashed');
      await page.screenshot({ path: testInfo.outputPath('master-muted.png') });
      await button('gallery.videoReview.restoreSourceAudio').click();
      await sound(false, 1);
      await expect(volume).toHaveValue('100');
      await change('40');
      await sound(false, 0.4);
      await button('gallery.videoReview.muteSourceAudio').click();
      await sound(true, 0);
      await expect(volume).toHaveValue('40');
      await button('gallery.videoReview.restoreSourceAudio').click();
      await sound(false, 0.4);
      await button('gallery.videoReview.muteSourceAudio').click();
      await expect
        .poll(() => persistedSourceAudio(page))
        .toMatchObject({ muted: true, volume: 0.4 });
      await change('70');
      await sound(false, 0.7);
      await expect
        .poll(() => persistedSourceAudio(page))
        .toMatchObject({ muted: false, volume: 0.7 });
      await button('gallery.videoReview.undo').click();
      await sound(true, 0);
      await button('gallery.videoReview.redo').click();
      await sound(false, 0.7);
      await change('0');
      await button('gallery.videoReview.back').click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      await expect(button('gallery.videoReview.advancedEditing')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await sound(true, 0);
      await button('gallery.videoReview.restoreSourceAudio').click();
      await sound(false, 1);
      await page.screenshot({ path: testInfo.outputPath('master-restored.png') });
      await button('gallery.videoReview.back').click();
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function persistedSourceAudio(page: Page) {
  const raw = await page.evaluate(
    async ({ databaseName, aggregateId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const request = db
            .transaction('video_workspaces')
            .objectStore('video_workspaces')
            .get(aggregateId);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    },
    {
      databaseName: betaV1Fixture.databaseName,
      aggregateId: `recording:${betaV1Fixture.records.recordings[0].id}`,
    }
  );
  const workspace = parseVideoWorkspace(raw);
  const latest = workspace?.history
    .slice(0, workspace.cursor)
    .findLast((operation) => operation.target === 'advancedContent');
  return latest?.target === 'advancedContent' ? latest.after.audio.original : undefined;
}
