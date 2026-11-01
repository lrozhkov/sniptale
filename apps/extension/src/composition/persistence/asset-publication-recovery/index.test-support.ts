import { vi, type Mock } from 'vitest';
import {
  createRetentionDatabaseFixture,
  createTargetAssetDatabaseFixture,
} from '../assets/retention-authority.test-support';
import type {
  AssetOperation,
  ArchiveRestoreSession,
  PhysicalDeleteAssetOperation,
} from '../assets/contracts';

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
    transaction: Mock<(names: string[], mode: string) => HarnessTransaction>;
  } = {
    put: async (storeName: string, value: Record<string, unknown>) =>
      put(storeName, deriveKey(storeName, value), value),
    delete: async (storeName: string, entryKey: unknown) =>
      stores.get(storeName)?.delete(key(entryKey)),
    get: async (storeName: string, entryKey: unknown) => stores.get(storeName)?.get(key(entryKey)),
    getAll: readRows,
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
