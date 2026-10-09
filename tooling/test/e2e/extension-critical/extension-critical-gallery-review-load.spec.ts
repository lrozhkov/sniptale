import { reviewAdvancedContentBaseline } from '../../../../apps/extension/src/features/video/review/document';
import { expect, test, type Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { parseVideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/parser';
import { startHostServer } from '../support/host-server';
import { applyHarnessBootstrap, GALLERY_HARNESS_PATH } from '../extension-critical.helpers';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';

async function readWorkspace(page: Page): Promise<unknown> {
  return await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('video_workspaces').objectStore('video_workspaces').getAll();
        request.onsuccess = () => resolve(request.result[0]);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

for (const locale of ['en', 'ru'] as const) {
  test(`saved review failure preserves data and exposes diagnostics (${locale})`, async ({
    page,
  }, info) => {
    const server = await startHostServer();
    const errors: string[] = [];
    page.on('console', async (message) => {
      if (message.type() === 'error')
        errors.push(
          JSON.stringify(await Promise.all(message.args().map((arg) => arg.jsonValue())))
        );
    });
    const label = (key: Parameters<typeof translate>[0]) => translate(key, locale);
    try {
      await applyHarnessBootstrap(page, {
        preserveMediaLibrary: true,
        storage: {
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': locale === 'ru' ? 'dark' : 'light',
        },
      });
      await page.goto(
        `${server.origin}${GALLERY_HARNESS_PATH}?theme=${locale === 'ru' ? 'dark' : 'light'}`
      );
      await page.locator('[data-ui="gallery.page.root"]').waitFor();
      await seedReviewVideo(page, 'review-vp8-opus.webm', {
        width: 160,
        height: 90,
        duration: 12.01,
      });
      await page.reload();
      const open = async () => {
        await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
        await page.locator('[data-ui="gallery.videoReview.enter"]').click();
      };
      await open();
      await expect(page.locator('dialog video').first()).toBeVisible();
      await page
        .locator('dialog')
        .getByRole('button', { name: label('common.actions.close'), exact: true })
        .click();
      const raw = await readWorkspace(page);
      const workspace = parseVideoWorkspace(raw);
      expect(workspace).not.toBeNull();
      const content = reviewAdvancedContentBaseline(workspace!.advanced);
      const corrupt = {
        ...workspace!,
        cursor: 0,
        history: [
          { id: 'no-op', at: 1, target: 'advancedContent', before: content, after: content },
        ],
      };
      await page.evaluate(async (row) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sniptale-db');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('video_workspaces', 'readwrite');
            tx.objectStore('video_workspaces').put(row);
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      }, corrupt);
      await page.reload();
      await open();
      await expect(page.getByRole('alert')).toContainText(
        label('gallery.videoReview.workspaceLoadFailed')
      );
      await expect(page.getByRole('alert')).toContainText(
        label('gallery.videoReview.workspaceLoadFailed')
      );
      const retry = page.getByRole('button', {
        name: label('gallery.videoReview.retry'),
        exact: true,
      });
      await expect(retry).toBeInViewport();
      await retry.click();
      await expect(page.getByRole('alert')).toContainText(
        label('gallery.videoReview.workspaceLoadFailed')
      );
      expect(await readWorkspace(page)).toEqual(corrupt);
      await expect
        .poll(() =>
          errors.some(
            (entry) =>
              entry.includes('video-review-open-failed') &&
              entry.includes('history-replay') &&
              entry.includes('no-change') &&
              entry.includes('operationIndex')
          )
        )
        .toBe(true);
      await page.screenshot({
        path: info.outputPath('saved-review-load-failure.png'),
        fullPage: false,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
}
