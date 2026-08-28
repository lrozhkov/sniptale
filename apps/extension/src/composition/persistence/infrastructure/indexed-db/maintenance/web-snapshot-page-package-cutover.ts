import { privacyErasureBrowserStorage } from '../../browser-storage/privacy-erasure';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY,
  WEB_SNAPSHOTS_STORE,
} from '../core.stores';
import { deleteAssetObject } from '../../../assets/opfs-store';
import { parseAssetOwner, parsePhysicalDeleteAssetOperation } from '../../../assets/guards';
import type { PhysicalDeleteAssetOperation } from '../../../assets/contracts';
import { parseStoredWebSnapshotRecord } from '../../../web-snapshots/guards';
import { parseMediaLibraryEntry } from '../../../media-library/read-guards';

const OWNER_KIND = 'web-snapshot';
const OWNER_ROLES = ['package', 'screenshot'] as const;

interface CutoverCompleteJournal {
  phase: 'complete';
  version: 1;
}

interface CutoverPendingJournal {
  operationId: string;
  phase: 'pending';
  version: 1;
}

type CutoverJournal = CutoverCompleteJournal | CutoverPendingJournal;

type CutoverCursor = {
  continue: () => Promise<CutoverCursor | null>;
  primaryKey: IDBValidKey;
  value: unknown;
};

type CutoverObjectStore = {
  delete: (key: IDBValidKey) => Promise<unknown>;
  get: (key: IDBValidKey) => Promise<unknown>;
  index: (name: string) => { count: (key: IDBValidKey) => Promise<number> };
  openCursor: () => Promise<CutoverCursor | null>;
  put: (value: unknown) => Promise<unknown>;
};

type CutoverTransaction = {
  done: Promise<unknown>;
  objectStore: (name: string) => CutoverObjectStore;
};

export type WebSnapshotPagePackageCutoverDatabase = {
  delete: (storeName: string, key: IDBValidKey) => Promise<unknown>;
  get: (storeName: string, key: IDBValidKey) => Promise<unknown>;
  transaction: (
    storeNames: string | string[],
    mode: 'readonly' | 'readwrite'
  ) => CutoverTransaction;
};

export function createWebSnapshotPagePackageCutoverDatabase(
  db: import('idb').IDBPDatabase
): WebSnapshotPagePackageCutoverDatabase {
  return {
    delete: (storeName, key) => db.delete(storeName, key),
    get: (storeName, key) => db.get(storeName, key),
    transaction: (storeNames, mode) => {
      const tx = db.transaction(storeNames, mode);
      return {
        done: tx.done,
        objectStore: (storeName) => {
          const store = tx.objectStore(storeName);
          const deleteRecord = store.delete!.bind(store);
          const putRecord = store.put!.bind(store);
          return {
            delete: (key) => deleteRecord(key),
            get: (key) => store.get(key),
            index: (name) => ({ count: (key) => store.index(name).count(key) }),
            openCursor: () => store.openCursor(),
            put: (value) => putRecord(value),
          };
        },
      };
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJournal(value: unknown): CutoverJournal | null {
  if (!isRecord(value) || value['version'] !== 1) return null;
  if (value['phase'] === 'complete' && Object.keys(value).length === 2) {
    return { phase: 'complete', version: 1 };
  }
  if (
    value['phase'] === 'pending' &&
    Object.keys(value).length === 3 &&
    typeof value['operationId'] === 'string' &&
    value['operationId'].length > 0 &&
    value['operationId'].length <= 512
  ) {
    return { operationId: value['operationId'], phase: 'pending', version: 1 };
  }
  return null;
}

async function readJournal(): Promise<CutoverJournal | null> {
  if (!privacyErasureBrowserStorage.local.isAvailable()) {
    throw new Error('Page Package cutover journal storage is unavailable.');
  }
  const values = await privacyErasureBrowserStorage.local.get(
    WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY
  );
  const raw = values[WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY];
  if (raw === undefined) return null;
  const journal = parseJournal(raw);
  if (!journal) throw new Error('Page Package cutover journal is invalid.');
  return journal;
}

function writeJournal(journal: CutoverJournal): Promise<void> {
  return privacyErasureBrowserStorage.local.set({
    [WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY]: journal,
  });
}

function assertLegacyOrCurrent(value: unknown): 'current' | 'legacy' {
  if (parseStoredWebSnapshotRecord(value)) return 'current';
  if (
    isRecord(value) &&
    isRecord(value['manifest']) &&
    value['manifest']['kind'] === 'page-package'
  ) {
    throw new Error('Invalid Page Package record blocks the Web Snapshot cutover.');
  }
  return 'legacy';
}

async function collectLegacySnapshotIds(
  db: WebSnapshotPagePackageCutoverDatabase
): Promise<string[]> {
  const tx = db.transaction(WEB_SNAPSHOTS_STORE, 'readonly');
  const ids: string[] = [];
  let cursor = await tx.objectStore(WEB_SNAPSHOTS_STORE).openCursor();
  while (cursor) {
    if (typeof cursor.primaryKey !== 'string' || cursor.primaryKey.length === 0) {
      throw new Error('Invalid Web Snapshot identity blocks the Page Package cutover.');
    }
    if (assertLegacyOrCurrent(cursor.value) === 'legacy') ids.push(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.done;
  return ids;
}

function candidateAssetIds(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [value['packageAssetId'], value['screenshotAssetId']].flatMap((candidate) =>
    typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 512
      ? [candidate]
      : []
  );
}

function createPhysicalDeleteOperation(operationId: string): PhysicalDeleteAssetOperation {
  const now = Date.now();
  return {
    assetIds: [],
    createdAt: now,
    kind: 'physical-delete',
    operationId,
    status: 'pending',
    updatedAt: now,
  };
}

async function deleteLegacyRows(
  db: WebSnapshotPagePackageCutoverDatabase,
  legacyIds: readonly string[],
  operationId: string
): Promise<PhysicalDeleteAssetOperation> {
  const operation = createPhysicalDeleteOperation(operationId);
  const tx = db.transaction(
    [
      WEB_SNAPSHOTS_STORE,
      MEDIA_LIBRARY_STORE,
      THUMBNAILS_STORE,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      ASSET_OPERATIONS_STORE,
    ],
    'readwrite'
  );
  const snapshotStore = tx.objectStore(WEB_SNAPSHOTS_STORE);
  const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
  const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
  const refStore = tx.objectStore(ASSET_REFS_STORE);
  for (const snapshotId of legacyIds) {
    const current: unknown = await snapshotStore.get(snapshotId);
    if (current === undefined || assertLegacyOrCurrent(current) === 'current') continue;
    const assetIds = new Set(candidateAssetIds(current));
    for (const role of OWNER_ROLES) {
      const ownerKey = [OWNER_KIND, snapshotId, role];
      const rawOwner: unknown = await ownerStore.get(ownerKey);
      if (rawOwner !== undefined) {
        const owner = parseAssetOwner(rawOwner);
        if (!owner || owner.ownerKind !== OWNER_KIND || owner.ownerId !== snapshotId) {
          throw new Error('Invalid Web Snapshot asset ownership blocks the Page Package cutover.');
        }
        assetIds.add(owner.assetId);
      }
      await ownerStore.delete(ownerKey);
    }
    for (const assetId of assetIds) {
      if ((await ownerStore.index('assetId').count(assetId)) !== 0) continue;
      await refStore.delete(assetId);
      operation.assetIds.push(assetId);
    }
    const rawMedia: unknown = await mediaStore.get(snapshotId);
    if (rawMedia !== undefined) {
      const media = parseMediaLibraryEntry(rawMedia);
      if (
        !media ||
        media.source.kind !== 'web-snapshot' ||
        media.source.snapshotId !== snapshotId
      ) {
        throw new Error('Invalid Web Snapshot media ownership blocks the Page Package cutover.');
      }
      await mediaStore.delete(snapshotId);
    }
    await tx.objectStore(THUMBNAILS_STORE).delete(snapshotId);
    await snapshotStore.delete(snapshotId);
  }
  operation.assetIds = [...new Set(operation.assetIds)];
  if (operation.assetIds.length > 0) {
    await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
  }
  await tx.done;
  return operation;
}

async function completePhysicalDelete(
  db: WebSnapshotPagePackageCutoverDatabase,
  operationId: string
): Promise<void> {
  const raw: unknown = await db.get(ASSET_OPERATIONS_STORE, operationId);
  if (raw === undefined) return;
  const operation = parsePhysicalDeleteAssetOperation(raw);
  if (!operation || operation.operationId !== operationId) {
    throw new Error('Page Package cutover cleanup journal is invalid.');
  }
  for (const assetId of operation.assetIds) await deleteAssetObject(assetId);
  await db.delete(ASSET_OPERATIONS_STORE, operationId);
}

/** One incompatible, destructive v1 reset. It never parses or converts legacy archive content. */
export async function runWebSnapshotPagePackageCutover(
  db: WebSnapshotPagePackageCutoverDatabase
): Promise<void> {
  const existingJournal = await readJournal();
  if (existingJournal?.phase === 'complete') return;
  const operationId =
    existingJournal?.phase === 'pending' ? existingJournal.operationId : crypto.randomUUID();
  await writeJournal({ operationId, phase: 'pending', version: 1 });
  await completePhysicalDelete(db, operationId);
  const legacyIds = await collectLegacySnapshotIds(db);
  if (legacyIds.length > 0) {
    await deleteLegacyRows(db, legacyIds, operationId);
    await completePhysicalDelete(db, operationId);
  }
  if ((await collectLegacySnapshotIds(db)).length > 0) {
    throw new Error('Web Snapshot v1 reset verification failed.');
  }
  await writeJournal({ phase: 'complete', version: 1 });
}
