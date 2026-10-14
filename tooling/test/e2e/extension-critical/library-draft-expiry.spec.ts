import { expect, test, type Page } from '@playwright/test';
import { parseMaintenanceLog } from '../../../../apps/extension/src/composition/persistence/library-lifecycle/maintenance-log-model';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { startHostServer } from '../support/host-server';
import { seedReviewVideo } from '../support/quick-editor-media-fixture';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import {
  applyHarnessBootstrap,
  SETTINGS_HARNESS_PATH,
  GALLERY_HARNESS_PATH,
} from '../extension-critical.helpers';

const day = 86_400_000;
const start = Date.UTC(2026, 0, 1);
const id = betaV1Fixture.records.media_library[0]!.id;

async function entry(page: Page) {
  return page.evaluate(
    async (mediaId) =>
      (await window.__sniptaleHarness?.getMediaLibraryState())?.find((item) => item.id === mediaId),
    id
  );
}

async function settled(page: Page) {
  await expect
    .poll(async () => {
      const raw = await page.evaluate(
        () => window.__sniptaleHarness?.getStorageState()['sniptale_library_maintenance_log']
      );
      return parseMaintenanceLog(raw).some(
        (event) => event.operation === 'orphans' && event.code === 'completed'
      );
    })
    .toBe(true);
}

async function hasSource(page: Page) {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const objects = await (
      await root.getDirectoryHandle('sniptale-assets')
    ).getDirectoryHandle('objects');
    try {
      return (await (await objects.getFileHandle('beta-v1-recording-asset')).getFile()).size > 0;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return false;
      throw error;
    }
  });
}

test('native draft expiry preserves bytes for 7/30 days, independent switches and restore renewal', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await page.clock.setFixedTime(start);
  await page.addInitScript(() => {
    const query = new URLSearchParams(location.search);
    window.__sniptaleHarnessBootstrap = {
      preserveMediaLibrary: true,
      storage: {
        'sniptale-locale-preference': 'en',
        'sniptale-theme-preference': 'light',
        sniptale_settings: {
          localStoragePolicy: {
            defaultDestination: 'temporary',
            recordingDestination: 'temporary',
            cleanupEnabled: query.get('draftCleanup') !== 'off',
            draftRetentionDays: 30,
            videoDraftRetentionDays: 7,
            trashCleanupEnabled: query.get('trashCleanup') === 'on',
            trashRetentionDays: 30,
          },
        },
      },
    };
  });
  const host = await startHostServer();
  const visit = async (time: number, drafts = true, trash = true) => {
    await page.clock.setFixedTime(time);
    await page.goto(
      `${host.origin}${GALLERY_HARNESS_PATH}?locale=en&draftCleanup=${drafts ? 'on' : 'off'}&trashCleanup=${trash ? 'on' : 'off'}`
    );
    await page.locator('[data-ui="gallery.page.root"]').waitFor();
    await settled(page);
  };
  try {
    await visit(start);
    await seedReviewVideo(page, 'review-vp8-opus.webm', {
      width: 160,
      height: 90,
      duration: 12.01,
    });
    await page.evaluate(
      async ({ fixture, time }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(fixture.databaseName);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const tx = db.transaction(['media_library', 'recordings'], 'readwrite');
          const done = new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
          for (const [store, key] of [
            ['media_library', fixture.records.media_library[0]!.id],
            ['recordings', fixture.records.recordings[0]!.id],
          ]) {
            const request = tx.objectStore(store!).get(key!);
            request.onsuccess = () =>
              tx.objectStore(store!).put({
                ...request.result,
                lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: time },
              });
          }
          await done;
        } finally {
          db.close();
        }
      },
      { fixture: betaV1Fixture, time: start }
    );
    await visit(start + 7 * day - 1);
    expect((await entry(page))?.lifecycle?.trashedAt).toBeUndefined();
    await visit(start + 7 * day, false, true);
    expect((await entry(page))?.lifecycle?.trashedAt).toBeUndefined();
    await visit(start + 7 * day);
    expect((await entry(page))?.lifecycle?.trashedAt).toBe(start + 7 * day);
    expect(await hasSource(page)).toBe(true);
    await visit(start + 38 * day, true, false);
    expect((await entry(page))?.lifecycle?.trashedAt).toBe(start + 7 * day);
    expect(await hasSource(page)).toBe(true);
    await page
      .locator('[data-ui="gallery.sidebar.footer"] button:not([data-ui="gallery.sidebar.toggle"])')
      .click();
    await page.getByRole('button', { name: 'beta-v1.webm', exact: true }).first().click();
    await page.screenshot({
      path: info.outputPath('expired-draft-retained-in-trash.png'),
      fullPage: false,
    });
    await page.locator('[data-ui="gallery.preview.restore"]').click();
    await expect.poll(async () => (await entry(page))?.lifecycle?.updatedAt).toBe(start + 38 * day);
    await visit(start + 45 * day - 1);
    expect((await entry(page))?.lifecycle?.trashedAt).toBeUndefined();
    await visit(start + 45 * day);
    expect((await entry(page))?.lifecycle?.trashedAt).toBe(start + 45 * day);
    await visit(start + 75 * day - 1);
    expect(await entry(page)).toBeDefined();
    expect(await hasSource(page)).toBe(true);
    await visit(start + 75 * day, false, true);
    expect(await entry(page)).toBeUndefined();
    expect(await hasSource(page)).toBe(false);
    await page.screenshot({ path: info.outputPath('expired-trash-purged.png'), fullPage: false });
  } finally {
    await page.close();
    await new Promise<void>((resolve) => host.server.close(() => resolve()));
  }
});

for (const variant of [
  { width: 1280, height: 560, locale: 'ru', theme: 'dark' },
  { width: 1920, height: 900, locale: 'en', theme: 'light' },
] as const) {
  test(`draft cleanup describes reversible Trash and confirms it in ${variant.locale}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.emulateMedia({ colorScheme: variant.theme });
    const host = await startHostServer();
    const label = (key: Parameters<typeof translate>[0]) => translate(key, variant.locale);
    try {
      await applyHarnessBootstrap(page, {
        storage: {
          'sniptale-locale-preference': variant.locale,
          'sniptale-theme-preference': variant.theme,
        },
      });
      await page.goto(
        `${host.origin}${SETTINGS_HARNESS_PATH}?section=saving&view=drafts&locale=${variant.locale}&theme=${variant.theme}`
      );
      const action = page.getByRole('button', {
        name: label('settings.storageDrafts.deleteAll'),
        exact: true,
      });
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeEnabled();
      await action.click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toContainText(label('settings.storageDrafts.deleteAllConfirm'));
      const confirm = dialog.getByRole('button', {
        name: label('settings.storageDrafts.moveToTrash'),
        exact: true,
      });
      await confirm.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath('reversible-draft-confirmation.png'),
        fullPage: false,
      });
      await confirm.click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByText(
          label('settings.storageDrafts.cleanupDone')
            .replace('{count}', '0')
            .replace('{retained}', '0'),
          { exact: true }
        )
      ).toBeVisible();
    } finally {
      await page.close();
      await new Promise<void>((resolve) => host.server.close(() => resolve()));
    }
  });
}
