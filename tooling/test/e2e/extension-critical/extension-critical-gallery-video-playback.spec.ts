import { expect, test } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  test(`gallery playback lifecycle and missing duration (${variant.locale}, ${variant.theme})`, async ({
    page,
  }) => {
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
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
      await page.evaluate(async (fixture) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(fixture.databaseName);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction('media_library', 'readwrite');
        const store = tx.objectStore('media_library');
        const request = store.get(fixture.records.media_library[0].id);
        request.onsuccess = () => store.put({ ...request.result, duration: null });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      }, betaV1Fixture);
      await page.reload();
      const open = async () => {
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().focus();
        await page.keyboard.press('Enter');
      };
      await open();
      const player = page.locator('[data-ui="gallery.preview.player"]');
      const video = player.locator('video');
      const central = player.getByRole('button', {
        name: label('gallery.preview.player.playVideo'),
        exact: true,
      });
      const clock = player.locator('[data-ui="gallery.preview.player.time"]');
      const timeline = player.locator('[data-ui="gallery.preview.player.timeline"]');
      await expect(central).toBeEnabled();
      const duration = await video.evaluate((element: HTMLVideoElement) => element.duration);
      expect(duration).toBeCloseTo(12, 1);
      const inspector = page.locator('[data-ui="gallery.preview.inspector"]');
      await expect(
        inspector.getByText(`${duration.toFixed(1)} ${label('gallery.preview.durationSuffix')}`, {
          exact: true,
        })
      ).toBeVisible();
      await expect(clock).toHaveText('0:12');
      const counterBox = (await clock.boundingBox())!,
        timelineBox = (await timeline.boundingBox())!;
      expect(counterBox.x).toBeGreaterThanOrEqual(timelineBox.x + timelineBox.width);
      expect(counterBox.y + counterBox.height).toBeLessThanOrEqual(720);
      await page.screenshot({
        path: `.tmp/backlog5-wave5/playback-${variant.locale}-${variant.theme}.png`,
      });
      await central.focus();
      await page.keyboard.press('Enter');
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
        .toBe(false);
      await expect(central).toHaveCount(0);
      await expect(clock).toHaveAttribute('aria-label', label('gallery.preview.player.remaining'));
      await expect(clock).toContainText('−');
      await player
        .getByRole('button', { name: label('gallery.preview.player.pause'), exact: true })
        .click();
      await expect(clock).toHaveText('0:12');
      await expect(central).toBeVisible();
      await video.click({ position: { x: 20, y: 20 } });
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
        .toBe(false);
      await player
        .getByRole('button', { name: label('gallery.preview.player.pause'), exact: true })
        .click();
      const scale = player.getByRole('button', {
        name: label('gallery.preview.player.scale'),
        exact: true,
      });
      await scale.click();
      await page
        .getByRole('option', { name: label('gallery.preview.player.original'), exact: true })
        .click();
      const viewport = player.locator('[data-ui="gallery.preview.player.viewport"]');
      const box = (await viewport.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 4 });
      await page.mouse.up();
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
        .toBe(true);
      await scale.click();
      await page
        .getByRole('option', { name: label('gallery.preview.player.fit'), exact: true })
        .click();
      await expect(central).toHaveCount(0);
      await page
        .getByRole('dialog')
        .getByRole('button', { name: label('common.actions.close'), exact: true })
        .click();
      await expect(player).toHaveCount(0);
      await open();
      await expect(central).toBeVisible();
      await expect(clock).toHaveText('0:12');
      await page.reload();
      await open();
      await expect(central).toBeVisible();
      await expect(
        inspector.getByText(`${duration.toFixed(1)} ${label('gallery.preview.durationSuffix')}`, {
          exact: true,
        })
      ).toBeVisible();
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
