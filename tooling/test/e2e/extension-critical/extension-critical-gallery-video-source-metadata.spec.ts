import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';

for (const variant of [
  { locale: 'ru' as const, theme: 'light' as const },
  { locale: 'en' as const, theme: 'dark' as const },
]) {
  test(`export retains recording facts after source deletion in ${variant.locale}/${variant.theme}`, async ({
    page,
  }, testInfo) => {
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
      await seedReviewVideo(
        page,
        'review-vp8-opus.webm',
        { width: 160, height: 90, duration: 12 },
        false,
        true
      );
      await page.reload();
      await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
      await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      const dialog = page.locator('dialog');
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.cutMode'), exact: true })
        .click();
      const bounds = (await dialog
        .locator('[data-ui="gallery.videoReview.sourceLane"]')
        .boundingBox())!;
      await page.mouse.move(bounds.x + (bounds.width * 2.1) / 12, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + (bounds.width * 4.1) / 12, bounds.y + bounds.height / 2, {
        steps: 8,
      });
      await page.mouse.up();
      await expect(
        dialog.getByRole('button', { name: variant.locale === 'ru' ? /^Вырезано ·/ : /^Cut ·/ })
      ).toHaveCount(1);
      await dialog.locator('[data-ui="gallery.videoReview.openExport"]').click();
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.exportVideo'), exact: true })
        .click();
      await expect.poll(async () => (await readExport(page))?.filename).toBeTruthy();
      const exported = (await readExport(page))!;
      expect(exported.recordingMetadata).toEqual({
        captureMode: 'TAB',
        displaySurface: null,
        actionCount: 1,
        hasPointer: false,
      });
      expect(exported.duration).toBeLessThan(12);
      expect(exported.width).toBe(160);
      await dialog
        .getByRole('button', { name: label('gallery.videoReview.back'), exact: true })
        .click();
      await page.evaluate(
        async ({ databaseName, recordingId }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          try {
            const transaction = db.transaction('recording_telemetry', 'readwrite');
            const done = new Promise<void>((resolve, reject) => {
              transaction.oncomplete = () => resolve();
              transaction.onabort = () => reject(transaction.error);
            });
            transaction.objectStore('recording_telemetry').delete(recordingId);
            await done;
          } finally {
            db.close();
          }
        },
        {
          databaseName: betaV1Fixture.databaseName,
          recordingId: betaV1Fixture.records.recordings[0].id,
        }
      );
      await page.reload();
      await page.getByRole('button', { name: exported.filename, exact: true }).first().click();
      const inspector = page.locator('[data-ui="gallery.preview.inspectorContent"]');
      const source = inspector.getByRole('region', {
        name: label('gallery.preview.source'),
        exact: true,
      });
      await expect(source).toContainText(label('gallery.preview.captureTab'));
      await expect(source).toContainText(label('gallery.preview.recordedActions'));
      await expect(source).not.toContainText(label('gallery.preview.sourceUnavailable'));
      await source.scrollIntoViewIfNeeded();
      await expect(source).toBeInViewport();
      expect(
        await inspector.evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath('export-recording-source.png') });
    } finally {
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}

async function readExport(page: Page) {
  return page.evaluate(
    async ({ databaseName, originalId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const rows: unknown = await new Promise((resolve, reject) => {
          const request = db.transaction('media_library').objectStore('media_library').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (!Array.isArray(rows)) throw new Error('Invalid library rows');
        for (const value of rows) {
          const row: unknown = value;
          if (
            !row ||
            typeof row !== 'object' ||
            !('kind' in row) ||
            row.kind !== 'video' ||
            !('id' in row) ||
            row.id === originalId ||
            !('filename' in row) ||
            typeof row.filename !== 'string' ||
            !('recordingMetadata' in row) ||
            !('duration' in row) ||
            typeof row.duration !== 'number' ||
            !('width' in row) ||
            typeof row.width !== 'number'
          )
            continue;
          return {
            filename: row.filename,
            recordingMetadata: row.recordingMetadata,
            duration: row.duration,
            width: row.width,
          };
        }
        return null;
      } finally {
        db.close();
      }
    },
    {
      databaseName: betaV1Fixture.databaseName,
      originalId: betaV1Fixture.records.media_library[0].id,
    }
  );
}
