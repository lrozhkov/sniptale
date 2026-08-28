import { beforeEach, expect, it, vi } from 'vitest';
import { createPagePackageManifestFixture } from '../../../../../features/web-snapshot/manifest.test-support';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY,
  WEB_SNAPSHOTS_STORE,
} from '../core.stores';

const mocks = vi.hoisted(() => ({
  deleteAssetObject: vi.fn(),
  local: new Map<string, unknown>(),
}));

vi.mock('../../../assets/opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../assets/opfs-store')>()),
  deleteAssetObject: mocks.deleteAssetObject,
}));

vi.mock('../../browser-storage/privacy-erasure', () => ({
  privacyErasureBrowserStorage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mocks.local.get(key) })),
      isAvailable: () => true,
      remove: vi.fn(async (key: string) => {
        mocks.local.delete(key);
      }),
      set: vi.fn(async (values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values)) mocks.local.set(key, value);
      }),
    },
  },
}));

import {
  runWebSnapshotPagePackageCutover,
  type WebSnapshotPagePackageCutoverDatabase,
} from './web-snapshot-page-package-cutover';

function compoundKey(value: IDBValidKey): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueKey(storeName: string, value: Record<string, unknown>): IDBValidKey {
  if (storeName === ASSET_OWNERS_STORE) {
    return [value['ownerKind'], value['ownerId'], value['role']] as IDBValidKey;
  }
  if (storeName === THUMBNAILS_STORE) return value['assetId'] as IDBValidKey;
  if (storeName === ASSET_REFS_STORE) return value['assetId'] as IDBValidKey;
  if (storeName === ASSET_OPERATIONS_STORE) return value['operationId'] as IDBValidKey;
  return value['id'] as IDBValidKey;
}

function createFakeDb(seed: Record<string, Record<string, unknown>[]>) {
  const stores = new Map<string, Map<string, unknown>>();
  for (const [storeName, values] of Object.entries(seed)) {
    stores.set(
      storeName,
      new Map(values.map((value) => [compoundKey(valueKey(storeName, value)), value]))
    );
  }
  for (const name of [
    WEB_SNAPSHOTS_STORE,
    MEDIA_LIBRARY_STORE,
    THUMBNAILS_STORE,
    ASSET_REFS_STORE,
    ASSET_OWNERS_STORE,
    ASSET_OPERATIONS_STORE,
  ]) {
    if (!stores.has(name)) stores.set(name, new Map());
  }

  const objectStore = (storeName: string) => {
    const store = stores.get(storeName)!;
    return {
      delete: vi.fn(async (key: IDBValidKey) => {
        store.delete(compoundKey(key));
      }),
      get: vi.fn(async (key: IDBValidKey) => store.get(compoundKey(key))),
      index: vi.fn(() => ({
        count: vi.fn(
          async (assetId: IDBValidKey) =>
            [...store.values()].filter(
              (value) =>
                typeof value === 'object' &&
                value !== null &&
                Reflect.get(value, 'assetId') === assetId
            ).length
        ),
      })),
      openCursor: vi.fn(async () => {
        const entries = [...store.entries()];
        type FakeCursor = {
          continue: () => Promise<FakeCursor | null>;
          primaryKey: IDBValidKey;
          value: unknown;
        };
        const cursorAt = (index: number): FakeCursor | null => {
          const entry = entries[index];
          if (!entry) return null;
          return {
            continue: vi.fn(async () => cursorAt(index + 1)),
            primaryKey: JSON.parse(entry[0]) as IDBValidKey,
            value: entry[1],
          };
        };
        return cursorAt(0);
      }),
      put: vi.fn(async (value: unknown) => {
        if (!isRecord(value)) throw new Error('Fake database accepts records only.');
        store.set(compoundKey(valueKey(storeName, value)), value);
      }),
    };
  };
  const db: WebSnapshotPagePackageCutoverDatabase = {
    delete: vi.fn(async (storeName: string, key: IDBValidKey) => {
      stores.get(storeName)?.delete(compoundKey(key));
    }),
    get: vi.fn(async (storeName: string, key: IDBValidKey) =>
      stores.get(storeName)?.get(compoundKey(key))
    ),
    transaction: vi.fn((names: string | string[], _mode: 'readonly' | 'readwrite') => ({
      done: Promise.resolve(),
      objectStore,
      store: typeof names === 'string' ? objectStore(names) : undefined,
    })),
  };
  return { db, stores };
}

function legacySnapshot() {
  return {
    createdAt: 1,
    id: 'snapshot-1',
    manifest: { captureMode: 'readOnlyNoScripts', schemaVersion: 1 },
    packageAssetId: 'package-1',
    screenshotAssetId: 'screenshot-1',
    screenshotMimeType: 'image/png',
    screenshotSize: 10,
    size: 20,
    updatedAt: 2,
  };
}

function mediaEntry() {
  return {
    createdAt: 1,
    duration: null,
    filename: 'snapshot.zip',
    height: 720,
    id: 'snapshot-1',
    kind: 'web-archive',
    mimeType: 'application/x-sniptale-web-snapshot+zip',
    originalFilename: 'snapshot.zip',
    size: 20,
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceFavicon: null,
    sourceTitle: 'Page',
    sourceUrl: null,
    tags: [],
    updatedAt: 2,
    width: 1280,
  };
}

beforeEach(() => {
  mocks.local.clear();
  vi.clearAllMocks();
  mocks.deleteAssetObject.mockResolvedValue(undefined);
});

it('atomically removes v1 rows, media projections, owners and unshared objects before admission', async () => {
  const { db, stores } = createFakeDb({
    [ASSET_OWNERS_STORE]: [
      { assetId: 'package-1', ownerId: 'snapshot-1', ownerKind: 'web-snapshot', role: 'package' },
      {
        assetId: 'screenshot-1',
        ownerId: 'snapshot-1',
        ownerKind: 'web-snapshot',
        role: 'screenshot',
      },
    ],
    [ASSET_REFS_STORE]: [{ assetId: 'package-1' }, { assetId: 'screenshot-1' }],
    [MEDIA_LIBRARY_STORE]: [mediaEntry()],
    [THUMBNAILS_STORE]: [{ assetId: 'snapshot-1' }],
    [WEB_SNAPSHOTS_STORE]: [legacySnapshot()],
  });

  await runWebSnapshotPagePackageCutover(db);

  expect(stores.get(WEB_SNAPSHOTS_STORE)?.size).toBe(0);
  expect(stores.get(MEDIA_LIBRARY_STORE)?.size).toBe(0);
  expect(stores.get(THUMBNAILS_STORE)?.size).toBe(0);
  expect(stores.get(ASSET_OWNERS_STORE)?.size).toBe(0);
  expect(stores.get(ASSET_REFS_STORE)?.size).toBe(0);
  expect(stores.get(ASSET_OPERATIONS_STORE)?.size).toBe(0);
  expect(mocks.deleteAssetObject.mock.calls.map(([assetId]) => assetId).sort()).toEqual([
    'package-1',
    'screenshot-1',
  ]);
  expect(mocks.local.get(WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY)).toEqual({
    phase: 'complete',
    version: 1,
  });
});

it('retains current Page Package rows and marks the incompatible reset complete once', async () => {
  const current = {
    ...legacySnapshot(),
    manifest: createPagePackageManifestFixture({ diagnosticsLevel: 'none' }),
  };
  const { db, stores } = createFakeDb({ [WEB_SNAPSHOTS_STORE]: [current] });

  await runWebSnapshotPagePackageCutover(db);
  await runWebSnapshotPagePackageCutover(db);

  expect(stores.get(WEB_SNAPSHOTS_STORE)?.size).toBe(1);
  expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
  expect(mocks.local.get(WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY)).toEqual({
    phase: 'complete',
    version: 1,
  });
});

it('blocks admission instead of deleting a malformed record that claims the current format', async () => {
  const malformedCurrent = {
    ...legacySnapshot(),
    manifest: { kind: 'page-package', schemaVersion: 2 },
  };
  const { db, stores } = createFakeDb({ [WEB_SNAPSHOTS_STORE]: [malformedCurrent] });

  await expect(runWebSnapshotPagePackageCutover(db)).rejects.toThrow(
    'Invalid Page Package record blocks the Web Snapshot cutover.'
  );

  expect(stores.get(WEB_SNAPSHOTS_STORE)?.size).toBe(1);
  expect(mocks.deleteAssetObject).not.toHaveBeenCalled();
  expect(mocks.local.get(WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY)).toMatchObject({
    phase: 'pending',
    version: 1,
  });
});

it('retains a fixed pending cleanup identity and completes it after OPFS recovers', async () => {
  const { db, stores } = createFakeDb({
    [ASSET_OWNERS_STORE]: [
      { assetId: 'package-1', ownerId: 'snapshot-1', ownerKind: 'web-snapshot', role: 'package' },
    ],
    [ASSET_REFS_STORE]: [{ assetId: 'package-1' }],
    [WEB_SNAPSHOTS_STORE]: [legacySnapshot()],
  });
  mocks.deleteAssetObject.mockRejectedValueOnce(new Error('OPFS busy'));

  await expect(runWebSnapshotPagePackageCutover(db)).rejects.toThrow('OPFS busy');
  const pending = mocks.local.get(WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY);
  expect(pending).toMatchObject({ phase: 'pending', version: 1 });
  expect(stores.get(ASSET_OPERATIONS_STORE)?.size).toBe(1);

  await runWebSnapshotPagePackageCutover(db);

  expect(mocks.local.get(WEB_SNAPSHOT_PAGE_PACKAGE_CUTOVER_KEY)).toEqual({
    phase: 'complete',
    version: 1,
  });
  expect(stores.get(ASSET_OPERATIONS_STORE)?.size).toBe(0);
});
