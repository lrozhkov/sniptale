import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completePhysicalDelete: vi.fn(),
  collectWriting: vi.fn(),
  deleteObject: vi.fn(),
  deleteJournal: vi.fn(),
  journals: vi.fn(),
  recoverStandalone: vi.fn(),
  runMutation: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  completePhysicalDeleteOperation: mocks.completePhysicalDelete,
  collectQuiescentWritingObjects: mocks.collectWriting,
  deleteAssetObject: mocks.deleteObject,
  deleteReadyJournal: mocks.deleteJournal,
  listReadyJournals: mocks.journals,
  recoverStandaloneAssetPublications: mocks.recoverStandalone,
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../recordings/asset-publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recordings/asset-publication')>()),
  RECORDING_ASSET_OWNER_KIND: 'recording',
  RECORDING_ASSET_ROLE: 'body',
  recordingAssetPublicationAdapter: { domain: 'recording-assets', publish: vi.fn() },
}));

import { recoverAssetPublications } from './index';
import type { AssetOperation, PhysicalDeleteAssetOperation } from '../assets';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.completePhysicalDelete.mockResolvedValue(undefined);
  mocks.collectWriting.mockResolvedValue(0);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deleteJournal.mockResolvedValue(undefined);
  mocks.journals.mockResolvedValue([]);
  mocks.recoverStandalone.mockResolvedValue(0);
});

it('retries durable physical-delete operations on startup', async () => {
  const operation: PhysicalDeleteAssetOperation = {
    assetIds: ['orphan-1'],
    createdAt: 1,
    kind: 'physical-delete',
    operationId: 'delete-1',
    status: 'pending',
    updatedAt: 1,
  };
  const harness = createDbHarness([operation]);
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(mocks.completePhysicalDelete).toHaveBeenCalledWith(operation);
  expect(mocks.recoverStandalone).toHaveBeenCalledOnce();
});

it('aborts and compensates a crashed restore before removing its uncommitted object', async () => {
  const previousRecording = {
    assetId: 'asset-old',
    createdAt: 1,
    filename: 'old.webm',
    id: 'recording-1',
    mimeType: 'video/webm',
    size: 3,
  };
  const previousRef = {
    assetId: 'asset-old',
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: 'objects/asset-old' },
    mimeType: 'video/webm',
    sha256: null,
    size: 3,
  };
  const previousOwner = {
    assetId: 'asset-old',
    ownerId: 'recording-1',
    ownerKind: 'recording',
    role: 'body',
  };
  const operation: AssetOperation = {
    compensations: [
      {
        assetId: 'asset-new',
        journalId: 'journal-1',
        nextMediaId: 'recording:recording-1',
        nextOwnerId: 'recording-1',
        previousRecords: {
          assetOwnerEntry: previousOwner,
          assetRefEntry: previousRef,
          recordingEntry: previousRecording,
        },
      },
    ],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: ['asset-old'],
    operationId: 'restore-1',
    status: 'pending',
    updatedAt: 1,
  };
  const harness = createDbHarness([operation]);
  harness.put('recordings', 'recording-1', { ...previousRecording, assetId: 'asset-new' });
  harness.put('asset_refs', 'asset-new', { assetId: 'asset-new' });
  harness.put('asset_owners', ['recording', 'recording-1', 'body'], {
    ...previousOwner,
    assetId: 'asset-new',
  });
  mocks.journals.mockResolvedValue([
    {
      assetRefs: [{ ...previousRef, assetId: 'asset-new' }],
      createdAt: 1,
      domain: 'recording-assets',
      journalId: 'journal-1',
      operationId: 'restore-1',
      payload: {},
    },
  ]);
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(harness.get('recordings', 'recording-1')).toEqual(previousRecording);
  expect(harness.get('asset_refs', 'asset-old')).toEqual(previousRef);
  expect(harness.get('asset_refs', 'asset-new')).toBeUndefined();
  expect(harness.get('asset_operations', 'restore-1')).toBeUndefined();
  expect(mocks.deleteObject).toHaveBeenCalledWith('asset-new');
  expect(mocks.deleteObject).not.toHaveBeenCalledWith('asset-old');
  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-1');
});

it('finishes journals and obsolete objects for a committed restore', async () => {
  const operation: AssetOperation = {
    compensations: [],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: ['asset-old'],
    operationId: 'restore-committed',
    status: 'committed',
    updatedAt: 2,
  };
  const harness = createDbHarness([operation]);
  mocks.journals.mockResolvedValue([
    {
      assetRefs: [],
      createdAt: 1,
      domain: 'recording-assets',
      journalId: 'journal-committed',
      operationId: 'restore-committed',
      payload: {},
    },
  ]);
  mocks.runMutation.mockImplementation(async (callback) => callback(harness.db));

  await recoverAssetPublications();

  expect(mocks.deleteJournal).toHaveBeenCalledWith('journal-committed');
  expect(mocks.deleteObject).toHaveBeenCalledWith('asset-old');
  expect(harness.get('asset_operations', 'restore-committed')).toBeUndefined();
});

function createDbHarness(operations: Array<AssetOperation | PhysicalDeleteAssetOperation>) {
  const stores = new Map<string, Map<string, unknown>>();
  const key = (value: unknown) => JSON.stringify(value);
  const put = (storeName: string, entryKey: unknown, value: unknown) => {
    let store = stores.get(storeName);
    if (!store) {
      store = new Map();
      stores.set(storeName, store);
    }
    store.set(key(entryKey), value);
  };
  for (const operation of operations) put('asset_operations', operation.operationId, operation);
  const deriveKey = (storeName: string, value: Record<string, unknown>) => {
    if (storeName === 'asset_operations') return value['operationId'];
    if (storeName === 'asset_refs') return value['assetId'];
    if (storeName === 'asset_owners') {
      return [value['ownerKind'], value['ownerId'], value['role']];
    }
    if (storeName === 'recording_telemetry') return value['recordingId'];
    return value['id'];
  };
  const objectStore = (storeName: string) => ({
    delete: async (entryKey: unknown) => stores.get(storeName)?.delete(key(entryKey)),
    get: async (entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    put: async (value: Record<string, unknown>) =>
      put(storeName, deriveKey(storeName, value), value),
  });
  const db = {
    delete: async (storeName: string, entryKey: unknown) =>
      stores.get(storeName)?.delete(key(entryKey)),
    get: async (storeName: string, entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    getAll: async (storeName: string) => [...(stores.get(storeName)?.values() ?? [])],
    transaction: vi.fn(() => ({ done: Promise.resolve(), objectStore })),
  };
  return {
    db,
    get: (storeName: string, entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    put,
  };
}
