import { expect, test as browserTest, type Page } from '@playwright/test';
import { BlobReader, ZipReader } from '@zip.js/zip.js';
import { writeFile } from 'node:fs/promises';
import { translate } from '../../../apps/extension/src/platform/i18n';
import { createVideoProject } from '../../../apps/extension/src/composition/persistence/projects/index.test-support';
import { createScenarioProjectV3 } from '../../../apps/extension/src/features/scenario/project/v3';
import { betaV1Fixture as betaV1PersistenceFixture } from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { test } from './support/extension-fixture';
import { startHostServer } from './support/host-server';
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

browserTest(
  'beta-v1 fixture hydrates a real IndexedDB and OPFS graph with stable domain contracts',
  async ({ page }) => {
    const host = await startHostServer();
    try {
      await page.goto(`${host.origin}${GALLERY_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-ui="gallery.page.root"]').waitFor({ state: 'visible' });

      const snapshot = await page.evaluate(async (fixture) => {
        const openDatabase = () =>
          new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(fixture.databaseName);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
        const complete = (transaction: IDBTransaction) =>
          new Promise<void>((resolve, reject) => {
            transaction.onabort = () => reject(transaction.error);
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => resolve();
          });
        const database = await openDatabase();
        const recordStores = Object.keys(fixture.records);
        const write = database.transaction(recordStores, 'readwrite');
        for (const [storeName, entries] of Object.entries(fixture.records)) {
          const store = write.objectStore(storeName);
          for (const entry of entries) store.put(entry);
        }
        await complete(write);
        database.close();

        const origin = await navigator.storage.getDirectory();
        const assets = await origin.getDirectoryHandle('sniptale-assets', { create: true });
        const objects = await assets.getDirectoryHandle('objects', { create: true });
        for (const object of fixture.opfsObjects) {
          const handle = await objects.getFileHandle(object.assetId, { create: true });
          const writable = await handle.createWritable();
          await writable.write(object.text);
          await writable.close();
        }

        const reopened = await openDatabase();
        const read = reopened.transaction([...recordStores, 'schema_contracts'], 'readonly');
        const keys = await Promise.all(
          recordStores.map(
            (storeName) =>
              new Promise<[string, IDBValidKey[]]>((resolve, reject) => {
                const request = read.objectStore(storeName).getAllKeys();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve([storeName, request.result]);
              })
          )
        );
        const contracts = await new Promise<Array<{ domainId: string; schemaVersion: number }>>(
          (resolve, reject) => {
            const request = read.objectStore('schema_contracts').getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          }
        );
        await complete(read);
        reopened.close();
        const objectText = await (await objects.getFileHandle(fixture.opfsObjects[0]!.assetId))
          .getFile()
          .then((file) => file.text());
        return {
          contracts: Object.fromEntries(
            contracts.map(({ domainId, schemaVersion }) => [domainId, schemaVersion])
          ),
          databaseVersion: database.version,
          objectText,
          recordKeys: Object.fromEntries(keys),
          stores: Array.from(database.objectStoreNames),
        };
      }, betaV1PersistenceFixture);

      expect(snapshot.databaseVersion).toBe(betaV1PersistenceFixture.databaseVersion);
      expect(snapshot.stores).toEqual([...betaV1PersistenceFixture.stores].sort());
      expect(snapshot.contracts).toEqual(betaV1PersistenceFixture.domainVersions);
      expect(snapshot.objectText).toBe(betaV1PersistenceFixture.opfsObjects[0]?.text);
      expect(snapshot.recordKeys).toMatchObject({
        asset_owners: [['recording', 'beta-v1-recording', 'body']],
        asset_refs: ['beta-v1-recording-asset'],
        media_library: ['recording:beta-v1-recording'],
        recordings: ['beta-v1-recording'],
        state_manager: [['video-recording-completion-outbox', 'pending']],
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        host.server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }
);

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
      const request = indexedDB.open('sniptale-db');
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

  await page.getByRole('button', { name: GALLERY_EXPORT_BACKUP_LABEL, exact: true }).click();
  await page
    .getByRole('button', { name: GALLERY_CONFIRM_EXPORT_BACKUP_LABEL, exact: true })
    .click();
  const backupPath = testInfo.outputPath('gallery-backup.zip');
  await expect.poll(() => readLastSavedFile(page)).not.toBeNull();
  const savedBackup = await readLastSavedFile(page);
  expect(savedBackup?.filename).toMatch(/^media-hub-backup-.*\.zip$/);
  await expect(readArchivePaths(savedBackup?.bytes ?? [])).resolves.toEqual(
    expect.arrayContaining([
      'Screenshots/gallery-backup.png',
      '_sniptale/catalog/media-000001.ndjson',
      '_sniptale/manifest.json',
    ])
  );
  await writeFile(backupPath, Uint8Array.from(savedBackup?.bytes ?? []));

  await page.getByRole('button', { name: GALLERY_IMPORT_BACKUP_LABEL, exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.locator('button', { hasText: GALLERY_IMPORT_DUPLICATE_LABEL }).click();

  await expect(page.locator('button', { hasText: GALLERY_IMPORT_DUPLICATE_LABEL })).toBeHidden();
  await expect(page.locator('[data-ui="gallery.import-progress"]')).toBeVisible();

  await expect.poll(() => countMediaLibraryEntries(page)).toBe(2);
});

test('gallery backup restores draft media and projects to a fresh Drafts retention interval', async ({
  page,
  hostOrigin,
}, testInfo) => {
  const createdAt = 1_000;
  const videoProject = createVideoProject({
    createdAt,
    id: 'draft-video-project',
    name: 'Draft video',
    updatedAt: createdAt,
  });
  const scenarioProject = {
    ...createScenarioProjectV3('Draft scenario'),
    createdAt,
    id: 'draft-scenario-project',
    updatedAt: createdAt,
  };
  await applyGalleryScreenshotBootstrap(page, {
    blobText: 'draft-image-bytes',
    createdAt,
    filename: 'draft image.png',
    height: 720,
    id: 'draft-image',
    size: 17,
    sourceTitle: 'Draft image',
    sourceUrl: 'https://example.com/draft',
    storageClass: 'temporary',
    tags: [],
    width: 1280,
  });
  await page.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="gallery.page.root"]').waitFor({ state: 'visible' });
  await seedDraftProjectEntries(page, videoProject, scenarioProject, createdAt);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: GALLERY_EXPORT_BACKUP_LABEL, exact: true }).click();
  await page.getByRole('checkbox').first().check();
  await page
    .getByRole('button', { name: GALLERY_CONFIRM_EXPORT_BACKUP_LABEL, exact: true })
    .click();
  await expect.poll(() => readLastSavedFile(page)).not.toBeNull();
  const backupPath = testInfo.outputPath('gallery-drafts-backup.zip');
  const savedBackup = await readLastSavedFile(page);
  const paths = await readArchivePaths(savedBackup?.bytes ?? []);
  expect(paths).toEqual(
    expect.arrayContaining([
      'Drafts/Screenshots/draft image.png',
      '_sniptale/metadata/video-projects/draft-video-project.json',
      '_sniptale/metadata/scenario-projects/draft-scenario-project.json',
    ])
  );
  await writeFile(backupPath, Uint8Array.from(savedBackup?.bytes ?? []));
  await clearDraftRoots(page);

  await page.getByRole('button', { name: GALLERY_IMPORT_BACKUP_LABEL, exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.locator('button', { hasText: GALLERY_IMPORT_DUPLICATE_LABEL }).click();
  await expect
    .poll(() => readDraftRootLifecycles(page))
    .toEqual([
      expect.objectContaining({ id: 'draft-image', savedAt: null, storageClass: 'temporary' }),
      expect.objectContaining({
        id: 'draft-scenario-project',
        savedAt: null,
        storageClass: 'temporary',
      }),
      expect.objectContaining({
        id: 'draft-video-project',
        savedAt: null,
        storageClass: 'temporary',
      }),
    ]);
  const restored = await readDraftRootLifecycles(page);
  expect(restored.every((entry) => entry.updatedAt > createdAt)).toBe(true);
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

  await page.getByRole('button', { name: GALLERY_EXPORT_BACKUP_LABEL, exact: true }).click();
  await page
    .getByRole('button', { name: GALLERY_CONFIRM_EXPORT_BACKUP_LABEL, exact: true })
    .click();
  const backupPath = testInfo.outputPath('durable-recording-backup.zip');
  await expect.poll(() => readLastSavedFile(page)).not.toBeNull();
  const savedBackup = await readLastSavedFile(page);
  await writeFile(backupPath, Uint8Array.from(savedBackup?.bytes ?? []));

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

async function readLastSavedFile(page: Page) {
  return page.evaluate(() => window.__sniptaleHarness?.getSavedFiles().at(-1) ?? null);
}

async function readArchivePaths(bytes: number[]): Promise<string[]> {
  const reader = new ZipReader(new BlobReader(new Blob([Uint8Array.from(bytes)])));
  try {
    return (await reader.getEntries()).map((entry) => entry.filename).sort();
  } finally {
    await reader.close();
  }
}

async function seedDraftProjectEntries(
  page: Page,
  videoProject: ReturnType<typeof createVideoProject>,
  scenarioProject: ReturnType<typeof createScenarioProjectV3>,
  updatedAt: number
) {
  await page.evaluate(
    async ({ scenario, video, now }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const transaction = database.transaction(
        ['video_projects', 'scenario_projects'],
        'readwrite'
      );
      const lifecycle = { savedAt: null, storageClass: 'temporary', updatedAt: now };
      transaction.objectStore('video_projects').put({
        createdAt: video.createdAt,
        id: video.id,
        lifecycle,
        project: video,
        updatedAt: video.updatedAt,
        workspaceRevision: 0,
      });
      transaction.objectStore('scenario_projects').put({
        createdAt: scenario.createdAt,
        id: scenario.id,
        lifecycle,
        project: scenario,
        updatedAt: scenario.updatedAt,
        workspaceRevision: 0,
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { now: updatedAt, scenario: scenarioProject, video: videoProject }
  );
}

async function clearDraftRoots(page: Page) {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction(
      ['media_library', 'video_projects', 'scenario_projects'],
      'readwrite'
    );
    transaction.objectStore('media_library').clear();
    transaction.objectStore('video_projects').clear();
    transaction.objectStore('scenario_projects').clear();
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });
}

async function readDraftRootLifecycles(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const rows = await Promise.all(
      ['media_library', 'scenario_projects', 'video_projects'].map(
        (store) =>
          new Promise<Record<string, unknown>[]>((resolve, reject) => {
            const request = database.transaction(store, 'readonly').objectStore(store).getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
          })
      )
    );
    database.close();
    return rows
      .flat()
      .map((entry) => ({
        id: entry['id'],
        savedAt:
          typeof entry['lifecycle'] === 'object' && entry['lifecycle'] !== null
            ? (entry['lifecycle'] as Record<string, unknown>)['savedAt']
            : undefined,
        storageClass:
          typeof entry['lifecycle'] === 'object' && entry['lifecycle'] !== null
            ? (entry['lifecycle'] as Record<string, unknown>)['storageClass']
            : undefined,
        updatedAt:
          typeof entry['lifecycle'] === 'object' && entry['lifecycle'] !== null
            ? (entry['lifecycle'] as Record<string, unknown>)['updatedAt']
            : undefined,
      }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  });
}

async function readDurableRecordingState(page: Page): Promise<{
  blobRows: number;
  objectCount: number;
  payloads: string[];
  recordingCount: number;
  refCount: number;
}> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
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

test('editor promotes, closes, reopens from Gallery, and autosaves hydrated files', async ({
  page,
  hostOrigin,
  context,
}) => {
  const consoleErrors: string[] = [];
  const capturePersistError = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  page.on('console', capturePersistError);
  await applyHarnessBootstrap(page, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    editorAutoApplyBrowserFrame: false,
    editorBootstrapPayload: createExactBrowserFrameHarnessPayload(),
  });
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ui="editor.page.root"]').waitFor({ state: 'visible' });

  await expect.poll(() => new URL(page.url()).searchParams.has('assetId')).toBe(true);
  const aggregateId = new URL(page.url()).searchParams.get('assetId');
  expect(aggregateId).not.toBeNull();
  const promoteButton = page.locator('[data-ui="editor.floating.document-bar.promote-button"]');
  await expect(promoteButton).toBeVisible();
  await promoteButton.click();
  await expect(promoteButton).toBeHidden();
  const promotedRevision = await readImageWorkspaceRevision(page, aggregateId!);
  expect(promotedRevision).not.toBeNull();
  await page.close();

  const galleryPage = await context.newPage();
  await applyHarnessBootstrap(galleryPage, { preserveMediaLibrary: true });
  await galleryPage.goto(`${hostOrigin}${GALLERY_HARNESS_PATH}`, {
    waitUntil: 'domcontentloaded',
  });
  await galleryPage.locator('[data-ui="gallery.page.root"]').waitFor({ state: 'visible' });
  const [stored] = await galleryPage.evaluate(
    async () => (await window.__sniptaleHarness?.getMediaLibraryState()) ?? []
  );
  expect(stored?.id).toBe(aggregateId);
  await galleryPage.locator('button', { hasText: stored!.filename }).first().click();
  const openInEditorButton = galleryPage.getByRole('button', {
    name: GALLERY_OPEN_IN_EDITOR_LABEL,
    exact: true,
  });
  await expect(openInEditorButton).toBeVisible();
  await openInEditorButton.evaluate((button) => (button as HTMLButtonElement).click());
  const [createdTab] = await galleryPage.evaluate(
    () => window.__sniptaleHarness?.getCreatedTabs() ?? []
  );
  const restoredAssetId = new URL(createdTab!.url).searchParams.get('assetId');
  expect(restoredAssetId).toBe(aggregateId);
  await galleryPage.close();

  const editorPage = await context.newPage();
  editorPage.on('console', capturePersistError);
  await applyHarnessBootstrap(editorPage, {
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    editorAutoApplyBrowserFrame: false,
    editorDispatchBootstrapPayload: false,
    preserveMediaLibrary: true,
  });
  await editorPage.goto(
    `${hostOrigin}${EDITOR_HARNESS_PATH}?assetId=${encodeURIComponent(restoredAssetId!)}`,
    { waitUntil: 'domcontentloaded' }
  );
  await editorPage.locator('[data-ui="editor.page.root"]').waitFor({ state: 'visible' });
  await expect
    .poll(
      async () =>
        await editorPage.evaluate(
          () => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0
        )
    )
    .toBeGreaterThan(0);
  await editorPage.evaluate(() => window.__sniptaleEditorHarness?.applyBrowserFrameMutation());
  await expect
    .poll(async () => (await readImageWorkspaceRevision(editorPage, aggregateId!)) ?? 0)
    .toBeGreaterThan(promotedRevision!);
  const firstRestoredRevision = await readImageWorkspaceRevision(editorPage, aggregateId!);
  expect(firstRestoredRevision).not.toBeNull();
  await editorPage.evaluate(() => window.__sniptaleEditorHarness?.applyBrowserFrameMutation());
  await expect
    .poll(async () => (await readImageWorkspaceRevision(editorPage, aggregateId!)) ?? 0)
    .toBeGreaterThan(firstRestoredRevision!);
  expect(
    consoleErrors.filter(
      (message) =>
        message.includes('Failed to persist draft') || message.includes('Failed to fetch')
    )
  ).toEqual([]);
  await editorPage.close();
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
