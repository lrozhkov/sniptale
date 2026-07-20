import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMediaEntry,
  createMediaItem,
  createProjectExportEntry,
  createScreenshotInput,
  createTelemetryEntry,
} from './store.test.helpers.ts';

const mediaHubStoreMocks = vi.hoisted(() => ({
  addMediaLibraryEntryTagsMock: vi.fn(),
  collectStorageCleanupReportMock: vi.fn(),
  commitProjectExportMock: vi.fn(),
  deleteMediaLibraryAssetMock: vi.fn(),
  deleteRecordingMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  saveProjectAssetMock: vi.fn(),
  saveRecordingMock: vi.fn(),
  saveRecordingTelemetryMock: vi.fn(),
  saveScreenshotMediaAssetMock: vi.fn(),
  saveWebSnapshotMediaAssetMock: vi.fn(),
  updateMediaLibraryEntryMock: vi.fn(),
  updateScreenshotMediaAssetMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
}));

vi.mock('../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/media-library/index')>()),
  addMediaLibraryEntryTags: mediaHubStoreMocks.addMediaLibraryEntryTagsMock,
  deleteMediaLibraryAsset: mediaHubStoreMocks.deleteMediaLibraryAssetMock,
  saveScreenshotMediaAsset: mediaHubStoreMocks.saveScreenshotMediaAssetMock,
  updateMediaLibraryEntry: mediaHubStoreMocks.updateMediaLibraryEntryMock,
  updateScreenshotMediaAsset: mediaHubStoreMocks.updateScreenshotMediaAssetMock,
}));

vi.mock('../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/index')>()),
  deleteRecording: mediaHubStoreMocks.deleteRecordingMock,
  saveRecording: mediaHubStoreMocks.saveRecordingMock,
}));

vi.mock('../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/telemetry')>()),
  saveRecordingTelemetry: mediaHubStoreMocks.saveRecordingTelemetryMock,
}));

vi.mock('../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/projects/index')>()),
  commitProjectExport: mediaHubStoreMocks.commitProjectExportMock,
  saveProjectAsset: mediaHubStoreMocks.saveProjectAssetMock,
}));

vi.mock('../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/web-snapshots')>()),
  saveWebSnapshotMediaAsset: mediaHubStoreMocks.saveWebSnapshotMediaAssetMock,
}));

vi.mock('../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/i18n')>();

  return {
    ...actual,
    translate: (key: string) =>
      key === 'shared.mediaHub.saveWebSnapshotAction'
        ? actual.translate(key as Parameters<typeof actual.translate>[0], 'ru')
        : key,
  };
});

vi.mock('../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/events')>()),
  publishMediaHubLibraryChanged: mediaHubStoreMocks.publishMediaHubLibraryChangedMock,
}));

vi.mock('../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: mediaHubStoreMocks.withMediaHubWriteGuardMock,
}));

vi.mock('./assembly', () => ({
  collectStorageCleanupReport: mediaHubStoreMocks.collectStorageCleanupReportMock,
}));

function resetMediaHubStoreMocks() {
  vi.clearAllMocks();
  mediaHubStoreMocks.withMediaHubWriteGuardMock.mockImplementation(
    async (_operation: string, callback: () => Promise<unknown>) => callback()
  );
  mediaHubStoreMocks.collectStorageCleanupReportMock.mockResolvedValue({
    groups: [],
    potentialBytes: 0,
  });
}

async function importMediaHubStoreModule() {
  vi.resetModules();
  return import('./store');
}

beforeEach(resetMediaHubStoreMocks);

describe('media-hub-store screenshot save flows', () => {
  it('saves and updates screenshot assets through the write guard and publishes change events', async () => {
    const { saveScreenshotMediaAssetSafely, updateScreenshotMediaAssetSafely } =
      await importMediaHubStoreModule();
    const createdEntry = createMediaEntry();
    const updatedEntry = createMediaEntry({ id: 'asset-2' });
    mediaHubStoreMocks.saveScreenshotMediaAssetMock.mockResolvedValue(createdEntry);
    mediaHubStoreMocks.updateScreenshotMediaAssetMock.mockResolvedValue(updatedEntry);

    await expect(saveScreenshotMediaAssetSafely(createScreenshotInput())).resolves.toEqual(
      createdEntry
    );
    await expect(
      updateScreenshotMediaAssetSafely('asset-2', new Blob(['updated']), 'updated.png')
    ).resolves.toEqual(updatedEntry);

    expect(mediaHubStoreMocks.withMediaHubWriteGuardMock).toHaveBeenNthCalledWith(
      1,
      'shared.mediaHub.saveScreenshotAction',
      expect.any(Function)
    );
    expect(mediaHubStoreMocks.withMediaHubWriteGuardMock).toHaveBeenNthCalledWith(
      2,
      'shared.mediaHub.updateScreenshotAction',
      expect.any(Function)
    );
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenNthCalledWith(
      1,
      'create',
      ['asset-1']
    );
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenNthCalledWith(
      2,
      'update',
      ['asset-2']
    );
    expect(mediaHubStoreMocks.withMediaHubWriteGuardMock).toHaveBeenCalledTimes(2);
  });
});

describe('media-hub-store web snapshot save flow', () => {
  it('saves web snapshot assets through the write guard and publishes change events', async () => {
    const { saveWebSnapshotMediaAssetSafely } = await importMediaHubStoreModule();
    mediaHubStoreMocks.saveWebSnapshotMediaAssetMock.mockResolvedValue({
      assetId: 'asset-web',
      snapshot: { id: 'asset-web' },
    });
    const input = {
      filename: 'snapshot.zip',
      manifest: { source: { title: 'Page', url: 'https://example.com' } },
      packageBlob: new Blob(['zip']),
      screenshotBlob: new Blob(['png']),
    };

    await expect(saveWebSnapshotMediaAssetSafely(input as never)).resolves.toEqual({
      assetId: 'asset-web',
    });

    expect(mediaHubStoreMocks.withMediaHubWriteGuardMock).toHaveBeenCalledWith(
      'сохранение Веб-снимка в Галерею',
      expect.any(Function)
    );
    expect(mediaHubStoreMocks.saveWebSnapshotMediaAssetMock).toHaveBeenCalledWith(input);
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('create', [
      'asset-web',
    ]);
  });
});

describe('media-hub-store recording and asset save flows', () => {
  it('saves recordings and telemetry through the guarded db seams', async () => {
    const { saveRecordingSafely, saveRecordingTelemetrySafely } = await importMediaHubStoreModule();
    const telemetryEntry = createTelemetryEntry();

    await saveRecordingSafely('recording-1', new Blob(['recording']), 'recording.webm');
    await saveRecordingTelemetrySafely(telemetryEntry);

    expect(mediaHubStoreMocks.saveRecordingMock).toHaveBeenCalledWith(
      'recording-1',
      expect.any(Blob),
      'recording.webm'
    );
    expect(mediaHubStoreMocks.saveRecordingTelemetryMock).toHaveBeenCalledWith(telemetryEntry);
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenNthCalledWith(
      1,
      'create',
      ['recording:recording-1']
    );
  });

  it('saves project assets and exports through the guarded db seams', async () => {
    const { saveProjectAssetSafely, saveProjectExportSafely } = await importMediaHubStoreModule();
    const exportEntry = createProjectExportEntry();

    await saveProjectAssetSafely('asset-1', new Blob(['asset']), 'image/png', 'asset.png');
    await saveProjectExportSafely(exportEntry);

    expect(mediaHubStoreMocks.saveProjectAssetMock).toHaveBeenCalledWith(
      'asset-1',
      expect.any(Blob),
      'image/png',
      'asset.png'
    );
    expect(mediaHubStoreMocks.commitProjectExportMock).toHaveBeenCalledWith(exportEntry);
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenNthCalledWith(
      1,
      'create',
      ['project-asset:asset-1']
    );
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenNthCalledWith(
      2,
      'create',
      ['export:export-1']
    );
  });
});

describe('media-hub-store metadata mutation flows', () => {
  it('updates and deletes media entries, including batched deletes', async () => {
    const { deleteMediaLibraryAssetsBatchSafely, updateMediaLibraryEntrySafely } =
      await importMediaHubStoreModule();

    await updateMediaLibraryEntrySafely('asset-1', { filename: 'renamed.png', tags: ['tag'] });
    await deleteMediaLibraryAssetsBatchSafely(['asset-1']);
    await deleteMediaLibraryAssetsBatchSafely(['asset-2', 'asset-3']);

    expect(mediaHubStoreMocks.updateMediaLibraryEntryMock).toHaveBeenCalledWith('asset-1', {
      filename: 'renamed.png',
      tags: ['tag'],
    });
    expect(mediaHubStoreMocks.deleteMediaLibraryAssetMock).toHaveBeenNthCalledWith(1, 'asset-1');
    expect(mediaHubStoreMocks.deleteMediaLibraryAssetMock).toHaveBeenNthCalledWith(2, 'asset-2');
    expect(mediaHubStoreMocks.deleteMediaLibraryAssetMock).toHaveBeenNthCalledWith(3, 'asset-3');
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenNthCalledWith(
      1,
      'update',
      ['asset-1']
    );
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenNthCalledWith(
      2,
      'delete',
      ['asset-1']
    );
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenNthCalledWith(
      3,
      'delete',
      ['asset-2', 'asset-3']
    );
  });
});

describe('media-hub-store cleanup and filtering flows', () => {
  it('deletes orphaned recordings and delegates storage cleanup reporting', async () => {
    const { deleteOrphanedRawRecordingsSafely, getStorageCleanupReport } =
      await importMediaHubStoreModule();
    mediaHubStoreMocks.collectStorageCleanupReportMock.mockResolvedValue({
      groups: [{ id: 'heavy-files', items: [], potentialBytes: 10 }],
      potentialBytes: 10,
    });

    await deleteOrphanedRawRecordingsSafely(['recording-1', 'recording-2']);
    await expect(getStorageCleanupReport(5)).resolves.toEqual({
      groups: [{ id: 'heavy-files', items: [], potentialBytes: 10 }],
      potentialBytes: 10,
    });

    expect(mediaHubStoreMocks.deleteRecordingMock).toHaveBeenNthCalledWith(1, 'recording-1');
    expect(mediaHubStoreMocks.deleteRecordingMock).toHaveBeenNthCalledWith(2, 'recording-2');
    expect(mediaHubStoreMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('cleanup', [
      'recording:recording-1',
      'recording:recording-2',
    ]);
    expect(mediaHubStoreMocks.collectStorageCleanupReportMock).toHaveBeenCalledWith(5);
  });

  it('filters media items by required tag sets', async () => {
    const { filterMediaItemsByTags } = await importMediaHubStoreModule();
    const items = [
      createMediaItem({ id: 'asset-1', tags: ['a', 'b'] }),
      createMediaItem({ id: 'asset-2', tags: ['a'] }),
      createMediaItem({ id: 'asset-3', tags: ['b', 'c'] }),
    ];

    expect(filterMediaItemsByTags(items, [])).toEqual(items);
    expect(filterMediaItemsByTags(items, ['a'])).toEqual([
      createMediaItem({ id: 'asset-1', tags: ['a', 'b'] }),
      createMediaItem({ id: 'asset-2', tags: ['a'] }),
    ]);
    expect(filterMediaItemsByTags(items, ['a', 'b'])).toEqual([
      createMediaItem({ id: 'asset-1', tags: ['a', 'b'] }),
    ]);
  });
});
