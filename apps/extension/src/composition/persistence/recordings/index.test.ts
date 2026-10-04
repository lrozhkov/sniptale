import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteUnreferenced: vi.fn(),
  buildDelete: vi.fn(),
  completeDelete: vi.fn(),
  dbGet: vi.fn(),
  dbGetAll: vi.fn(),
  initDB: vi.fn(),
  readFile: vi.fn(),
  runMutation: vi.fn(),
  saveBatch: vi.fn(),
}));

vi.mock('../media-library/delete-cascade', () => ({
  deleteUnreferencedMediaSource: mocks.deleteUnreferenced,
}));
vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  ASSET_OPERATIONS_STORE: 'asset_operations',
  ASSET_OWNERS_STORE: 'asset_owners',
  ASSET_REFS_STORE: 'asset_refs',
  MEDIA_LIBRARY_STORE: 'media_library',
  RECORDING_TELEMETRY_STORE: 'recording_telemetry',
  STORE_NAME: 'recordings',
  initDB: mocks.initDB,
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  buildPhysicalDeleteOperation: mocks.buildDelete,
  completePhysicalDeleteOperation: mocks.completeDelete,
  readAssetFile: mocks.readFile,
}));

vi.mock('./batch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./batch')>()),
  saveRecordingsBatch: mocks.saveBatch,
}));

import { deleteRecording, getRecording, listRecordings, saveRecording } from './index';

const stored = {
  assetId: 'asset-1',
  createdAt: 1_000,
  filename: 'recording.webm',
  id: 'recording-1',
  lifecycle: { savedAt: 1_000, storageClass: 'library' as const, updatedAt: 1_000 },
  mimeType: 'video/webm',
  size: 5,
};
const ref = {
  assetId: 'asset-1',
  createdAt: 900,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-1' },
  mimeType: 'video/webm',
  sha256: null,
  size: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue({ get: mocks.dbGet, getAll: mocks.dbGetAll });
  mocks.buildDelete.mockReturnValue({
    assetIds: [],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  });
  mocks.completeDelete.mockResolvedValue(undefined);
});

describe('recordings catalog', () => {
  it('hydrates bytes from OPFS only for the single-recording read path', async () => {
    const file = new File(['video'], stored.filename, { type: stored.mimeType });
    mocks.dbGet.mockResolvedValueOnce(stored).mockResolvedValueOnce(ref);
    mocks.readFile.mockResolvedValue(file);

    await expect(getRecording(stored.id)).resolves.toEqual({ ...stored, file });
    expect(mocks.readFile).toHaveBeenCalledWith(ref, stored.filename);
  });

  it('returns undefined for invalid metadata, missing refs, and unavailable objects', async () => {
    mocks.dbGet.mockResolvedValueOnce({ invalid: true });
    await expect(getRecording('invalid')).resolves.toBeUndefined();

    mocks.dbGet.mockResolvedValueOnce(stored).mockResolvedValueOnce(undefined);
    await expect(getRecording(stored.id)).resolves.toBeUndefined();

    mocks.dbGet.mockResolvedValueOnce(stored).mockResolvedValueOnce(ref);
    mocks.readFile.mockRejectedValueOnce(new Error('missing object'));
    await expect(getRecording(stored.id)).resolves.toBeUndefined();
  });

  it('lists metadata without reading OPFS objects', async () => {
    const recordingGroup = {
      dimensions: { height: 720, width: 1280 },
      groupId: 'capture-1',
      order: 0,
      role: 'display',
      sourceLabel: 'Design review',
    };
    mocks.dbGetAll.mockResolvedValue([{ ...stored, recordingGroup }]);

    await expect(listRecordings()).resolves.toEqual([
      expect.objectContaining({
        assetId: 'asset-1',
        id: 'recording-1',
        mimeType: 'video/webm',
        recordingGroup,
        thumbnailId: 'recording:recording-1',
      }),
    ]);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it('propagates source-admission failure from common service deletion', async () => {
    const failure = new Error('retained consumer');
    mocks.deleteUnreferenced.mockRejectedValueOnce(failure);
    await expect(deleteRecording(stored.id)).rejects.toBe(failure);
    expect(mocks.deleteUnreferenced).toHaveBeenCalledWith({
      id: `recording:${stored.id}`,
      source: { kind: 'recording', recordingId: stored.id },
    });
    expect(mocks.completeDelete).not.toHaveBeenCalled();
  });

  it('streams the compatibility Blob input through the batch owner', async () => {
    const blob = new Blob(['video'], { type: 'video/webm' });
    await saveRecording('recording-1', blob, 'recording.webm');
    expect(mocks.saveBatch).toHaveBeenCalledWith([
      { blob, filename: 'recording.webm', id: 'recording-1' },
    ]);
  });
});
