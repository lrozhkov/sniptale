import { expect, type Page } from '@playwright/test';
import { translate } from '../../../apps/extension/src/platform/i18n';
import { test } from './support/extension-fixture';
import {
  createExactBrowserFrameHarnessPayload,
  applyGalleryScreenshotBootstrap,
  applyHarnessBootstrap,
  countMediaLibraryEntries,
  countRuntimeMessagesByType,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  EDITOR_HARNESS_PATH,
  GALLERY_EXPORT_BACKUP_LABEL,
  GALLERY_CONFIRM_EXPORT_BACKUP_LABEL,
  GALLERY_HARNESS_PATH,
  GALLERY_IMPORT_BACKUP_LABEL,
  GALLERY_IMPORT_DUPLICATE_LABEL,
  GALLERY_OPEN_IN_EDITOR_LABEL,
  getHarnessStorageState,
  getRuntimeMessagesByType,
  QUICK_ACTIONS_KEY,
  SETTINGS_ADD_ACTION_LABEL,
  SETTINGS_HARNESS_PATH,
  SETTINGS_NAME_PLACEHOLDER,
  SETTINGS_QUICK_ACTIONS_LABEL,
  SETTINGS_SAVE_LABEL,
  POPUP_HARNESS_PATH,
} from './extension-critical.helpers';

const EDITOR_FRAME_LABEL = translate('editor.toolbar.frame', 'ru');

async function openEditorHarness(page: Page, hostOrigin: string) {
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  });
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="editor.page.root"]').waitFor({ state: 'visible' });
}

async function openEditorFrameUtility(page: Page): Promise<void> {
  await page.getByTitle(EDITOR_FRAME_LABEL, { exact: true }).click();
  await expect(page.locator('[data-ui="editor.floating.utility-panel.frame"]')).toBeVisible();
  await expect(
    page.locator('[data-ui="editor.floating.utility-panel.close-button"]')
  ).toBeVisible();
}

async function readImageWorkspaceRevision(page: Page, aggregateId: string): Promise<number | null> {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-video-db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const entry = await new Promise<unknown>((resolve, reject) => {
      const request = database
        .transaction('image_workspaces', 'readonly')
        .objectStore('image_workspaces')
        .get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    if (typeof entry !== 'object' || entry === null || !('revision' in entry)) {
      return null;
    }
    return typeof entry.revision === 'number' ? entry.revision : null;
  }, aggregateId);
}

async function hasStoredQuickAction(page: Page, actionName: string): Promise<boolean> {
  const storageState = await getHarnessStorageState(page);
  const storedActions = storageState[QUICK_ACTIONS_KEY];
  if (!Array.isArray(storedActions)) {
    return false;
  }

  return storedActions.some((action) => {
    return (
      typeof action === 'object' &&
      action !== null &&
      'name' in action &&
      action.name === actionName
    );
  });
}

test('settings quick action persists into popup and dispatches from the saved state', async ({
  page,
  hostOrigin,
  context,
}) => {
  const createdActionName = 'Критический снимок';

  await page.goto(`${hostOrigin}${SETTINGS_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="settings.page.root"]').waitFor({ state: 'visible' });

  await page.getByRole('button', { name: SETTINGS_QUICK_ACTIONS_LABEL, exact: true }).click();
  await page.getByRole('button', { name: SETTINGS_ADD_ACTION_LABEL, exact: true }).click();
  await page.getByPlaceholder(SETTINGS_NAME_PLACEHOLDER, { exact: true }).fill(createdActionName);
  await page.getByRole('button', { name: SETTINGS_SAVE_LABEL, exact: true }).click();

  await expect.poll(() => hasStoredQuickAction(page, createdActionName)).toBe(true);

  const storageState = await getHarnessStorageState(page);
  const popupPage = await context.newPage();
  await applyHarnessBootstrap(popupPage, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    storage: storageState,
  });

  await popupPage.goto(`${hostOrigin}${POPUP_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await popupPage.locator('[data-ui="popup.app.root"]').waitFor({ state: 'visible' });
  await popupPage.locator('button', { hasText: createdActionName }).click();

  await expect.poll(() => countRuntimeMessagesByType(popupPage, 'TRIGGER_QUICK_ACTION')).toBe(1);

  const [message] = await getRuntimeMessagesByType(popupPage, 'TRIGGER_QUICK_ACTION');
  expect(message).toMatchObject({
    type: 'TRIGGER_QUICK_ACTION',
    actionId: expect.any(String),
    tabId: expect.any(Number),
  });

  await popupPage.close();
});

test('gallery image asset opens the editor from preview actions', async ({ page, hostOrigin }) => {
  const assetId = 'gallery-critical-asset';
  const filename = 'gallery-critical.png';
  const createdAt = Date.now();

  await applyGalleryScreenshotBootstrap(page, {
    id: assetId,
    filename,
    createdAt,
    size: 128,
    width: 1280,
    height: 720,
    sourceUrl: 'https://example.com/gallery-critical',
    sourceTitle: 'Gallery critical seed',
    tags: ['critical'],
    blobText: 'critical-image',
  });

  await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="gallery.page.root"]').waitFor({ state: 'visible' });
  await page.locator('button', { hasText: filename }).first().click();

  const openInEditorButton = page.getByRole('button', {
    name: GALLERY_OPEN_IN_EDITOR_LABEL,
    exact: true,
  });
  await expect(openInEditorButton).toBeVisible();
  await openInEditorButton.click();

  await expect
    .poll(async () => {
      const tabs = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
      return tabs.length;
    })
    .toBe(1);

  const [createdTab] = await page.evaluate(() => window.__sniptaleHarness?.getCreatedTabs() ?? []);
  expect(createdTab?.url).toContain('/apps/extension/src/editor/index.html?assetId=');
  expect(createdTab?.url).toContain(`assetId=${assetId}`);
});

test('gallery backup export imports media as duplicate through the modal flow', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const assetId = 'gallery-backup-asset';
  const filename = 'gallery-backup.png';
  const createdAt = Date.now();

  await applyGalleryScreenshotBootstrap(page, {
    id: assetId,
    filename,
    createdAt,
    size: 256,
    width: 1440,
    height: 900,
    sourceUrl: 'https://example.com/gallery-backup',
    sourceTitle: 'Gallery backup seed',
    tags: ['backup'],
    blobText: 'backup-image',
  });

  await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="gallery.page.root"]').waitFor({ state: 'visible' });
  await expect.poll(() => countMediaLibraryEntries(page)).toBe(1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: GALLERY_EXPORT_BACKUP_LABEL, exact: true }).click();
  await page
    .getByRole('button', { name: GALLERY_CONFIRM_EXPORT_BACKUP_LABEL, exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^media-hub-backup-.*\.zip$/);

  const backupPath = testInfo.outputPath('gallery-backup.zip');
  await download.saveAs(backupPath);

  await page.getByRole('button', { name: GALLERY_IMPORT_BACKUP_LABEL, exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.locator('button', { hasText: GALLERY_IMPORT_DUPLICATE_LABEL }).click();

  await expect.poll(() => countMediaLibraryEntries(page)).toBe(2);
});

test('recording backup round-trip keeps durable bytes in OPFS without recording Blob rows', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await applyHarnessBootstrap(page, {
    recordings: [
      {
        bytes: 'durable-recording-e2e-payload',
        filename: 'durable-recording.webm',
        id: 'durable-recording-e2e',
        mimeType: 'video/webm',
      },
    ],
  });
  await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="gallery.page.root"]').waitFor({ state: 'visible' });
  await expect
    .poll(() => readDurableRecordingState(page))
    .toEqual({
      blobRows: 0,
      objectCount: 1,
      payloads: ['durable-recording-e2e-payload'],
      recordingCount: 1,
      refCount: 1,
    });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: GALLERY_EXPORT_BACKUP_LABEL, exact: true }).click();
  await page
    .getByRole('button', { name: GALLERY_CONFIRM_EXPORT_BACKUP_LABEL, exact: true })
    .click();
  const backupPath = testInfo.outputPath('durable-recording-backup.zip');
  await (await downloadPromise).saveAs(backupPath);

  await page.getByRole('button', { name: GALLERY_IMPORT_BACKUP_LABEL, exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.locator('button', { hasText: GALLERY_IMPORT_DUPLICATE_LABEL }).click();

  await expect
    .poll(() => readDurableRecordingState(page))
    .toEqual({
      blobRows: 0,
      objectCount: 2,
      payloads: ['durable-recording-e2e-payload', 'durable-recording-e2e-payload'],
      recordingCount: 2,
      refCount: 2,
    });
});

async function readDurableRecordingState(page: Page): Promise<{
  blobRows: number;
  objectCount: number;
  payloads: string[];
  recordingCount: number;
  refCount: number;
}> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-video-db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const readAll = (storeName: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    const [recordings, refs] = await Promise.all([readAll('recordings'), readAll('asset_refs')]);
    database.close();
    const origin = await navigator.storage.getDirectory();
    const assetRoot = await origin.getDirectoryHandle('sniptale-assets');
    const objects = await assetRoot.getDirectoryHandle('objects');
    let objectCount = 0;
    for await (const [, handle] of objects.entries()) {
      if (handle.kind === 'file') objectCount += 1;
    }
    const assetIds = recordings.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null || !('assetId' in entry)) return [];
      return typeof entry.assetId === 'string' ? [entry.assetId] : [];
    });
    const payloads = await Promise.all(
      assetIds.map(async (assetId) =>
        (await (await objects.getFileHandle(assetId)).getFile()).text()
      )
    );
    return {
      blobRows: recordings.filter(
        (entry) => typeof entry === 'object' && entry !== null && 'blob' in entry
      ).length,
      objectCount,
      payloads: payloads.sort(),
      recordingCount: recordings.length,
      refCount: refs.length,
    };
  });
}

test('editor save and copy actions emit observable side effects', async ({ page, hostOrigin }) => {
  await openEditorHarness(page, hostOrigin);

  const saveButton = page.locator('[data-ui="editor.floating.document-bar.save-button"]');
  const copyButton = page.locator('[data-ui="editor.floating.document-bar.copy-button"]');

  await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  await expect(copyButton).toBeEnabled({ timeout: 15_000 });

  await saveButton.click();

  await expect.poll(() => countRuntimeMessagesByType(page, 'EXECUTE_SAVE')).toBe(1);

  const [saveMessage] = await getRuntimeMessagesByType(page, 'EXECUTE_SAVE');
  expect(saveMessage).toMatchObject({
    type: 'EXECUTE_SAVE',
    actionType: 'download_default',
  });
  expect(saveMessage.dataUrl).toContain('data:image/png;base64,');

  await copyButton.click();

  await expect
    .poll(async () => {
      const writes = await page.evaluate(
        () => window.__sniptaleHarness?.getClipboardWrites() ?? []
      );
      return writes.length;
    })
    .toBe(1);

  const [clipboardWrite] = await page.evaluate(
    () => window.__sniptaleHarness?.getClipboardWrites() ?? []
  );
  expect(clipboardWrite?.types).toContain('image/png');
});

test('editor reopens a persisted workspace and autosaves without revoking its file URLs', async ({
  page,
  hostOrigin,
}) => {
  const persistErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Failed to persist draft')) {
      persistErrors.push(message.text());
    }
  });
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    editorAutoApplyBrowserFrame: true,
    editorBootstrapPayload: createExactBrowserFrameHarnessPayload(),
  });
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="editor.page.root"]').waitFor({ state: 'visible' });

  await expect.poll(() => new URL(page.url()).searchParams.has('assetId')).toBe(true);
  const aggregateId = new URL(page.url()).searchParams.get('assetId');
  expect(aggregateId).not.toBeNull();
  await expect
    .poll(async () => (await readImageWorkspaceRevision(page, aggregateId!)) ?? 0)
    .toBeGreaterThan(0);
  const firstRevision = await readImageWorkspaceRevision(page, aggregateId!);
  expect(firstRevision).not.toBeNull();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="editor.page.root"]').waitFor({ state: 'visible' });
  await expect
    .poll(async () => (await readImageWorkspaceRevision(page, aggregateId!)) ?? 0)
    .toBeGreaterThan(firstRevision!);
  expect(persistErrors).toEqual([]);
});

test('editor exact browser-frame harness stays visually stable', async ({ page, hostOrigin }) => {
  await page.setViewportSize({ width: 1680, height: 1200 });
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    editorAutoApplyBrowserFrame: true,
    editorBootstrapPayload: createExactBrowserFrameHarnessPayload(),
  });
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });

  const sceneSurface = page.locator('[data-ui="editor.canvas.surface-hit-area"] > div');
  await sceneSurface.waitFor({ state: 'visible' });
  await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (
          window.__sniptaleEditorHarness?.getCanvasObjects().some((object) => {
            return object['sniptaleType'] === 'browser-frame';
          }) ?? false
        );
      });
    })
    .toBe(true);
  await page.evaluate(() => {
    window.__sniptaleEditorHarness?.setZoomLevel(1244 / 1920);
  });
  await expect
    .poll(async () => {
      return sceneSurface.evaluate((element) => Math.round(element.getBoundingClientRect().width));
    })
    .toBe(1244);
  await page.evaluate(() => {
    window.__sniptaleEditorHarness?.clearSelection();
  });

  await expect(sceneSurface).toHaveScreenshot('editor-browser-frame-exact.png');
});

test('editor frame utility opens from the floating tool rail', async ({ page, hostOrigin }) => {
  await openEditorHarness(page, hostOrigin);
  await openEditorFrameUtility(page);
});
