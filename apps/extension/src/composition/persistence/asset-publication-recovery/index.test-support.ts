import { afterEach, beforeEach, vi, type Mock } from 'vitest';
import {
  createRetentionDatabaseFixture,
  createTargetAssetDatabaseFixture,
} from '../assets/retention-authority.test-support';
import type {
  AssetOperation,
  ArchiveRestoreSession,
  PhysicalDeleteAssetOperation,
} from '../assets/contracts';
import { projectRowReferenceKeys } from '../assets/retention-index-projection';

export function createDbHarness(
  operations: Array<AssetOperation | ArchiveRestoreSession | PhysicalDeleteAssetOperation>
) {
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
    getAll: async () => [...(stores.get(storeName)?.values() ?? [])],
    index: () => ({
      getAll: async (query: string, count?: number) =>
        [...(stores.get(storeName)?.values() ?? [])]
          .filter((row) => projectRowReferenceKeys(storeName, row).includes(query))
          .slice(0, count),
    }),
    delete: async (entryKey: unknown) => stores.get(storeName)?.delete(key(entryKey)),
    get: async (entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    put: async (value: Record<string, unknown>) =>
      put(storeName, deriveKey(storeName, value), value),
  });
  type HarnessTransaction =
    | ReturnType<ReturnType<typeof createRetentionDatabaseFixture>['transaction']>
    | ReturnType<ReturnType<typeof createTargetAssetDatabaseFixture>['transaction']>
    | { done: Promise<void>; objectStore: typeof objectStore };
  const readRows = async (storeName: string) => [...(stores.get(storeName)?.values() ?? [])];
  const db: {
    put(storeName: string, value: Record<string, unknown>): Promise<void>;
    delete(storeName: string, entryKey: unknown): Promise<boolean | undefined>;
    get(storeName: string, entryKey: unknown): Promise<unknown>;
    getAll(storeName: string): Promise<unknown[]>;
    getAllFromIndex(storeName: string, index: string, query: IDBValidKey): Promise<unknown[]>;
    transaction: Mock<(names: string[], mode: string) => HarnessTransaction>;
  } = {
    put: async (storeName: string, value: Record<string, unknown>) =>
      put(storeName, deriveKey(storeName, value), value),
    delete: async (storeName: string, entryKey: unknown) =>
      stores.get(storeName)?.delete(key(entryKey)),
    get: async (storeName: string, entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    getAll: readRows,
    getAllFromIndex: async (storeName, index, query) =>
      (await readRows(storeName)).filter(
        (row) => typeof row === 'object' && row !== null && Reflect.get(row, index) === query
      ),
    transaction: vi.fn<(names: string[], mode: string) => HarnessTransaction>((names, mode) => {
      if (mode !== 'readonly') return { done: Promise.resolve(), objectStore };
      if (names.length > 1)
        return createTargetAssetDatabaseFixture(db.getAll).transaction(names, 'readonly');
      return createRetentionDatabaseFixture(db.getAll).transaction(names);
    }),
  };
  return {
    db,
    get: (storeName: string, entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    put,
  };
}

export function createRef(assetId: string) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
    mimeType: 'application/octet-stream',
    sha256: null,
    size: 3,
  };
}

export function createWebSnapshotCompensation(
  assetId: string,
  ownerRole: string,
  previousRecords: Record<string, unknown>
): AssetOperation['compensations'][number] {
  return {
    assetId,
    journalId: 'journal-web-snapshot',
    nextMediaId: 'snapshot-1',
    nextOwnerId: 'snapshot-1',
    nextWebSnapshotId: 'snapshot-1',
    ownerKind: 'web-snapshot',
    ownerRole,
    previousRecords,
  };
}

const mocks = vi.hoisted(() => ({
  retireCursorStages: vi.fn(),
  retireEventStages: vi.fn(),
  completePhysicalDelete: vi.fn(),
  collectWriting: vi.fn(),
  physicalAuthority: vi.fn(),
  prepareReadyIndex: vi.fn(),
  readyClaims: vi.fn(),
  deleteObject: vi.fn(),
  deleteJournal: vi.fn(),
  journals: vi.fn(),
  objects: vi.fn(),
  writing: vi.fn(),
  recoverStandalone: vi.fn(),
  recoverNative: vi.fn(),
  runMutation: vi.fn(),
}));

vi.mock('../recordings/native-history/recovery', () => ({
  recoverNativeRecordingHistories: mocks.recoverNative,
}));

vi.mock('../recordings/recording-events/staging', () => ({
  retireJournalRecordingEventStages: mocks.retireEventStages,
}));
vi.mock('../recordings/cursor-trajectory/staging', () => ({
  retireJournalCursorTrajectoryStages: mocks.retireCursorStages,
}));

vi.mock('../assets/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets/operations')>()),
  completePhysicalDeleteOperation: mocks.completePhysicalDelete,
  readPhysicalDeleteAuthority: mocks.physicalAuthority,
}));
vi.mock('../assets/opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets/opfs-store')>()),
  deleteReadyJournal: mocks.deleteJournal,
  deleteAssetObject: mocks.deleteObject,
  listReadyJournals: mocks.journals,
  prepareAssetReadyClaimIndex: mocks.prepareReadyIndex,
  readAssetReadyClaims: mocks.readyClaims,
  readWritingAssetIds: mocks.writing,
}));
vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  completePhysicalDeleteOperation: mocks.completePhysicalDelete,
  collectQuiescentWritingObjects: mocks.collectWriting,
  deleteAssetObject: mocks.deleteObject,
  deleteReadyJournal: mocks.deleteJournal,
  listReadyJournals: mocks.journals,
  listAssetObjectIds: mocks.objects,
  listWritingAssetIds: mocks.writing,
  recoverStandaloneAssetPublications: mocks.recoverStandalone,
}));

vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: vi.fn(async () => undefined),
}));

vi.mock('../recordings/asset-publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recordings/asset-publication')>()),
  RECORDING_ASSET_OWNER_KIND: 'recording',
  RECORDING_ASSET_ROLE: 'body',
  recordingAssetPublicationAdapter: { domain: 'recording-assets', publish: vi.fn() },
}));

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        operation: (lock: object) => Promise<unknown>
      ) => operation({}),
    },
  });
  vi.clearAllMocks();
  mocks.retireCursorStages.mockResolvedValue(undefined);
  mocks.retireEventStages.mockResolvedValue(undefined);
  mocks.completePhysicalDelete.mockResolvedValue(undefined);
  mocks.collectWriting.mockResolvedValue(0);
  mocks.prepareReadyIndex.mockResolvedValue(undefined);
  mocks.readyClaims.mockResolvedValue({ valid: true, assetIds: new Set(), journals: [] });
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deleteJournal.mockResolvedValue(undefined);
  mocks.journals.mockResolvedValue([]);
  mocks.objects.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
  mocks.recoverStandalone.mockResolvedValue(0);
  mocks.recoverNative.mockResolvedValue(0);
});

export function getAssetPublicationRecoveryMocks() {
  return mocks;
}
