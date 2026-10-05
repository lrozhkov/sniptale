import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'en', theme: 'light', narrow: false },
  { locale: 'ru', theme: 'dark', narrow: false },
  { locale: 'en', theme: 'light', narrow: true },
] as const) {
  test(`action history rows stay stable through zoom (${variant.locale}, narrow=${variant.narrow})`, async ({
    page,
  }, info) => {
    if (variant.narrow) await page.setViewportSize({ width: 1200, height: 560 });
    const server = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(`${server.origin}${GALLERY_HARNESS_PATH}?theme=${variant.theme}`);
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await seedHistory(page);
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      const markers = dialog.locator(
        `button[aria-label^="${label('gallery.videoReview.telemetry')} ·"]`
      );
      await expect(markers).toHaveCount(8);
      const strip = markers.first().locator('..');
      const rows = () =>
        markers.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).top));
      const initialRows = await rows();
      const height = (await strip.boundingBox())!.height;
      expect(height).toBe(68);
      await markers.first().click();
      await expect(markers.first()).toHaveAttribute('aria-pressed', 'true');
      const zoom = dialog.getByRole('slider', {
        name: label('videoEditor.timeline.zoom'),
        exact: true,
      });
      for (const value of ['0.1', '6.7', '19.3', '25', '41.7', '75', '100', '37.1', '0']) {
        await zoom.fill(value);
        await zoom.dispatchEvent('input');
        await expect.poll(rows).toEqual(initialRows);
        expect((await strip.boundingBox())!.height).toBe(height);
        await expect(markers.first()).toHaveAttribute('aria-pressed', 'true');
      }
      await zoom.fill('50');
      await zoom.dispatchEvent('input');
      const viewport = dialog.locator('[data-ui="gallery.videoReview.timelineViewport"]');
      await viewport.evaluate((node) => {
        node.scrollLeft = node.scrollWidth / 2;
      });
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath('zoomed-history.png'), fullPage: false });
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.fit'), exact: true })
        .click();
      await expect.poll(rows).toEqual(initialRows);
      // Dense tail stays keyboard/click reachable within its own scroll owner.
      const tail = markers.filter({ hasText: label('gallery.videoReview.eventClick') }).last();
      await tail.focus();
      await tail.press('Enter');
      await expect(tail).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => strip.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await strip.evaluate((node) => {
        node.scrollTop = 0;
      });
      await page.screenshot({ path: info.outputPath('fit-history.png'), fullPage: false });
      await expect(
        dialog.getByRole('button', { name: label('gallery.videoReview.back'), exact: true })
      ).toBeInViewport();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}

async function seedHistory(page: Page) {
  await page.evaluate(async (fixture) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(fixture.databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('recording_telemetry', 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    transaction.objectStore('recording_telemetry').put({
      recordingId: fixture.records.recordings[0].id,
      captureMode: 'TAB',
      createdAt: 1,
      updatedAt: 1,
      viewport: null,
      cursorTrack: null,
      signals: [
        [0.13, 3.27],
        [3.27, 6.41],
      ].map(([startTime, endTime], index) => ({
        id: `idle-${index}`,
        kind: 'cursor-idle',
        startTime,
        endTime,
        point: null,
        data: {},
      })),
      actionEvents: Array.from({ length: 6 }, (_, index) => ({
        id: `click-${index}`,
        kind: 'CLICK',
        time: 1 + index * 0.01,
        duration: 0,
        point: { x: 40, y: 30 },
        recordingPoint: { x: 0.25, y: 0.33 },
        label: '',
        data: {},
        preset: 'NONE',
      })),
    });
    await done;
    db.close();
  }, betaV1Fixture);
}
