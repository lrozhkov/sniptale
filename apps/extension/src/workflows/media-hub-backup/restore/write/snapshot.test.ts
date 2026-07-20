import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';

const { getStoreMock } = vi.hoisted(() => ({
  getStoreMock: vi.fn(),
}));

vi.mock('../../storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage')>()),
  getStore: getStoreMock,
}));

function createMediaEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<Omit<MediaLibraryEntry, 'blob'>> = {}
): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 10,
    duration: null,
    filename: 'asset.webm',
    height: 1080,
    id: 'asset-1',
    kind: 'export',
    mimeType: 'video/webm',
    originalFilename: 'asset.webm',
    size: 123,
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}

function createWriteHarness(records: Record<string, Record<string, unknown>>) {
  const stores = new Map(
    Object.entries(records).map(([name, entries]) => [
      name,
      {
        delete: vi.fn(),
        get: vi.fn(async (key: IDBValidKey) => entries[String(key)]),
        put: vi.fn(),
      },
    ])
  );

  getStoreMock.mockImplementation((_tx, storeName: string) => {
    const store = stores.get(storeName);
    if (!store) {
      throw new Error(`Unknown store ${storeName}`);
    }

    return store;
  });

  const tx = {
    objectStore: vi.fn(),
  };

  return { stores, tx };
}

beforeEach(() => {
  getStoreMock.mockReset();
});

it('snapshots and restores all backing records for replaced project exports', async () => {
  const { restoreAssetRecordSnapshot, snapshotExistingAssetRecord } = await import('.');
  const entry = createMediaEntry({
    exportId: 'export-1',
    kind: 'project-export',
    projectId: 'project-1',
    recordingId: 'recording-1',
  });
  const mediaRecord = { id: entry.id, kind: 'media-library' };
  const recordingRecord = { id: 'recording-1', kind: 'recording' };
  const telemetryRecord = { recordingId: 'recording-1', kind: 'telemetry' };
  const exportRecord = { id: 'export-1', kind: 'project-export' };
  const thumbnailRecord = { assetId: entry.id, kind: 'thumbnail' };
  const { stores, tx } = createWriteHarness({
    media_library: { [entry.id]: mediaRecord },
    project_assets: {},
    project_exports: { 'export-1': exportRecord },
    recording_telemetry: { 'recording-1': telemetryRecord },
    recordings: { 'recording-1': recordingRecord },
    thumbnails: { [entry.id]: thumbnailRecord },
    web_snapshots: {},
  });

  const snapshot = await snapshotExistingAssetRecord(tx, entry);
  await restoreAssetRecordSnapshot(tx, snapshot);

  expect(stores.get('media_library')?.get).toHaveBeenCalledWith(entry.id);
  expect(stores.get('recordings')?.get).toHaveBeenCalledWith('recording-1');
  expect(stores.get('recording_telemetry')?.get).toHaveBeenCalledWith('recording-1');
  expect(stores.get('project_exports')?.get).toHaveBeenCalledWith('export-1');
  expect(stores.get('thumbnails')?.get).toHaveBeenCalledWith(entry.id);
  expect(stores.get('recordings')?.put).toHaveBeenCalledWith(recordingRecord);
  expect(stores.get('recording_telemetry')?.put).toHaveBeenCalledWith(telemetryRecord);
  expect(stores.get('project_exports')?.put).toHaveBeenCalledWith(exportRecord);
  expect(stores.get('media_library')?.put).toHaveBeenCalledWith(mediaRecord);
  expect(stores.get('thumbnails')?.put).toHaveBeenCalledWith(thumbnailRecord);
});

it('snapshots backing records for recording, project asset, and web snapshot sources', async () => {
  const { snapshotExistingAssetRecord } = await import('.');
  const { stores, tx } = createWriteHarness({
    media_library: { 'recording-entry': { id: 'recording-entry' } },
    project_assets: { 'project-asset-1': { id: 'project-asset-1' } },
    project_exports: {},
    recording_telemetry: { 'recording-1': { recordingId: 'recording-1' } },
    recordings: { 'recording-1': { id: 'recording-1' } },
    thumbnails: {},
    web_snapshots: { 'snapshot-1': { id: 'snapshot-1' } },
  });

  await snapshotExistingAssetRecord(
    tx,
    createMediaEntry({ kind: 'recording', recordingId: 'recording-1' }, { id: 'recording-entry' })
  );
  await snapshotExistingAssetRecord(
    tx,
    createMediaEntry({ kind: 'project-asset', projectAssetId: 'project-asset-1' })
  );
  await snapshotExistingAssetRecord(
    tx,
    createMediaEntry({ kind: 'web-snapshot', snapshotId: 'snapshot-1' })
  );

  expect(stores.get('recordings')?.get).toHaveBeenCalledWith('recording-1');
  expect(stores.get('recording_telemetry')?.get).toHaveBeenCalledWith('recording-1');
  expect(stores.get('project_assets')?.get).toHaveBeenCalledWith('project-asset-1');
  expect(stores.get('web_snapshots')?.get).toHaveBeenCalledWith('snapshot-1');
});

it('deletes existing backing records for replace compensation by source kind', async () => {
  const { deleteExistingAssetRecord } = await import('.');
  const { stores, tx } = createWriteHarness({
    media_library: {},
    project_assets: {},
    project_exports: {},
    recording_telemetry: {},
    recordings: {},
    thumbnails: {},
    web_snapshots: {},
  });

  await deleteExistingAssetRecord(
    tx,
    createMediaEntry({ kind: 'recording', recordingId: 'recording-1' }, { id: 'recording-entry' })
  );
  await deleteExistingAssetRecord(
    tx,
    createMediaEntry({ kind: 'project-asset', projectAssetId: 'project-asset-1' })
  );
  await deleteExistingAssetRecord(
    tx,
    createMediaEntry({ kind: 'web-snapshot', snapshotId: 'snapshot-1' })
  );

  expect(stores.get('recordings')?.delete).toHaveBeenCalledWith('recording-1');
  expect(stores.get('recording_telemetry')?.delete).toHaveBeenCalledWith('recording-1');
  expect(stores.get('project_assets')?.delete).toHaveBeenCalledWith('project-asset-1');
  expect(stores.get('web_snapshots')?.delete).toHaveBeenCalledWith('snapshot-1');
  expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('recording-entry');
  expect(stores.get('thumbnails')?.delete).toHaveBeenCalledWith('recording-entry');
});
