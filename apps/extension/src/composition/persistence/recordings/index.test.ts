import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildDelete: vi.fn(),
  completeDelete: vi.fn(),
  dbGet: vi.fn(),
  dbGetAll: vi.fn(),
  initDB: vi.fn(),
  readFile: vi.fn(),
  runMutation: vi.fn(),
  saveBatch: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
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
    mocks.dbGetAll.mockResolvedValue([stored]);

    await expect(listRecordings()).resolves.toEqual([
      expect.objectContaining({
        assetId: 'asset-1',
        id: 'recording-1',
        mimeType: 'video/webm',
        thumbnailId: 'recording:recording-1',
      }),
    ]);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it('commits a physical-delete intent with the graph unlink and completes it afterward', async () => {
    const deletes: Array<[string, unknown]> = [];
    const puts: Array<[string, unknown]> = [];
    const stores = new Map<string, ReturnType<typeof createStore>>();
    const tx = {
      done: Promise.resolve(),
      objectStore(name: string) {
        let store = stores.get(name);
        if (!store) {
          store = createStore(name, deletes, puts);
          stores.set(name, store);
        }
        return store;
      },
    };
    const db = { transaction: vi.fn().mockReturnValue(tx) };
    mocks.runMutation.mockImplementation(async (operation) => operation(db));

    await deleteRecording(stored.id);

    expect(puts).toContainEqual([
      'asset_operations',
      expect.objectContaining({ assetIds: ['asset-1'], kind: 'physical-delete' }),
    ]);
    expect(mocks.completeDelete).toHaveBeenCalledWith(
      expect.objectContaining({ assetIds: ['asset-1'] })
    );
  });

  it('keeps a shared asset and skips physical deletion', async () => {
    const stores = new Map<string, ReturnType<typeof createStore>>();
    const tx = {
      done: Promise.resolve(),
      objectStore(name: string) {
        let store = stores.get(name);
        if (!store) {
          store = createStore(name, [], []);
          if (name === 'asset_owners')
            store.index = vi.fn(() => ({ count: vi.fn().mockResolvedValue(1) }));
          stores.set(name, store);
        }
        return store;
      },
    };
    mocks.runMutation.mockImplementation(async (operation) => operation({ transaction: () => tx }));

    await deleteRecording(stored.id);

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

function createStore(
  name: string,
  deletes: Array<[string, unknown]>,
  puts: Array<[string, unknown]>
) {
  return {
    delete: vi.fn(async (key: unknown) => deletes.push([name, key])),
    get: vi.fn().mockResolvedValue(name === 'recordings' ? stored : undefined),
    index: vi.fn(() => ({ count: vi.fn().mockResolvedValue(0) })),
    put: vi.fn(async (value: unknown) => puts.push([name, value])),
  };
}
