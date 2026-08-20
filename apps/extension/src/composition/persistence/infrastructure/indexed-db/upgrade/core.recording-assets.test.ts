import { expect, it, vi } from 'vitest';
import { handleDatabaseUpgrade } from './core';
import { applyRecordingAssetsV26Upgrade } from './core.recording-assets';

function createUpgradeHarness() {
  const initial = createInitialEntries();
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const transaction = {
    abort: vi.fn(),
    objectStore: vi.fn((name: string) => {
      let store = stores.get(name);
      if (!store) {
        store = createStore(initial.get(name) ?? []);
        stores.set(name, store);
      }
      return store;
    }),
  };
  const createdStores = new Map<string, { createIndex: ReturnType<typeof vi.fn> }>();
  const db = {
    createObjectStore: vi.fn((name: string) => {
      const store = { createIndex: vi.fn() };
      createdStores.set(name, store);
      return store;
    }),
    deleteObjectStore: vi.fn(),
    objectStoreNames: { contains: vi.fn(() => false) },
  };
  return { createdStores, db, stores, transaction };
}

function createInitialEntries() {
  return new Map<string, unknown[]>([
    ['recordings', [{ id: 'recording-1', blob: new Blob(['legacy']) }]],
    [
      'video_projects',
      [
        {
          id: 'project-base-recording',
          project: { assets: [], baseRecordingId: 'recording-1' },
        },
        {
          id: 'project-asset-recording',
          project: {
            assets: [{ source: { kind: 'recording', recordingId: 'recording-1' } }],
          },
        },
        {
          id: 'project-origin-recording',
          project: {
            assets: [
              { source: { kind: 'project-asset', projectAssetId: 'temporary-only' } },
              {
                source: {
                  kind: 'project-asset',
                  originRecordingId: 'recording-1',
                  projectAssetId: 'library-owned',
                },
              },
              { source: { kind: 'project-asset', projectAssetId: 'shared' } },
            ],
          },
        },
        {
          id: 'project-direct-source',
          project: { assets: [], source: { kind: 'recording', recordingId: 'recording-1' } },
        },
        {
          id: 'project-retained',
          project: {
            assets: [{ source: { kind: 'project-asset', projectAssetId: 'shared' } }],
          },
        },
      ],
    ],
    [
      'media_library',
      [
        { id: 'recording:recording-1', source: { kind: 'recording' } },
        {
          id: 'export:export-1',
          source: { exportId: 'export-1', kind: 'project-export' },
        },
        {
          id: 'project-asset:temporary-only',
          lifecycle: { storageClass: 'temporary' },
          source: { kind: 'project-asset', projectAssetId: 'temporary-only' },
        },
        {
          id: 'project-asset:shared',
          lifecycle: { storageClass: 'temporary' },
          source: { kind: 'project-asset', projectAssetId: 'shared' },
        },
        {
          id: 'project-asset:library-owned',
          lifecycle: { storageClass: 'library' },
          source: { kind: 'project-asset', projectAssetId: 'library-owned' },
        },
      ],
    ],
    ['project_exports', [{ id: 'export-1', recordingId: 'recording-1' }]],
  ]);
}

function createStore(entries: unknown[]) {
  return {
    clear: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue(entries),
  };
}

it('creates asset stores and selectively resets the dangling legacy recording graph', async () => {
  const harness = createUpgradeHarness();

  await applyRecordingAssetsV26Upgrade(harness.db, 25, harness.transaction);

  expect(harness.db.createObjectStore).toHaveBeenCalledWith('asset_refs', {
    keyPath: 'assetId',
  });
  expect(harness.createdStores.get('asset_owners')?.createIndex).toHaveBeenCalledWith(
    'assetId',
    'assetId'
  );
  expect(harness.stores.get('recordings')?.clear).toHaveBeenCalledOnce();
  expect(harness.stores.get('video_projects')?.delete).toHaveBeenCalledWith(
    'project-base-recording'
  );
  expect(harness.stores.get('video_projects')?.delete).toHaveBeenCalledWith(
    'project-asset-recording'
  );
  expect(harness.stores.get('video_projects')?.delete).toHaveBeenCalledWith(
    'project-origin-recording'
  );
  expect(harness.stores.get('video_projects')?.delete).toHaveBeenCalledWith(
    'project-direct-source'
  );
  expect(harness.stores.get('project_exports')?.delete).toHaveBeenCalledWith('export-1');
  expect(harness.stores.get('video_projects')?.delete).not.toHaveBeenCalledWith('project-retained');
  expect(harness.stores.get('project_assets')?.delete).toHaveBeenCalledWith('temporary-only');
  expect(harness.stores.get('project_assets')?.delete).not.toHaveBeenCalledWith('shared');
  expect(harness.stores.get('project_assets')?.delete).not.toHaveBeenCalledWith('library-owned');
  expect(harness.stores.get('media_library')?.delete).toHaveBeenCalledWith('recording:recording-1');
  expect(harness.stores.get('aggregate_presentations')?.delete).toHaveBeenCalledWith([
    'video-project',
    'project-base-recording',
  ]);
  expect(harness.stores.has('scenario_projects')).toBe(false);
  expect(harness.stores.get('recording_telemetry')?.clear).toHaveBeenCalledOnce();
  expect(harness.stores.get('diagnostics_meta')?.clear).toHaveBeenCalledOnce();
  expect(harness.stores.get('diagnostics_events')?.clear).toHaveBeenCalledOnce();
  expect(harness.stores.get('state_manager')?.delete).toHaveBeenCalledWith([
    'video-recording-completion-outbox',
    'pending',
  ]);
});

it('is non-destructive for a fresh or already upgraded database', async () => {
  const fresh = createUpgradeHarness();
  await expect(
    applyRecordingAssetsV26Upgrade(fresh.db, 0, fresh.transaction)
  ).resolves.toBeUndefined();
  expect(fresh.transaction.objectStore).not.toHaveBeenCalled();

  const current = createUpgradeHarness();
  await expect(
    applyRecordingAssetsV26Upgrade(current.db, 26, current.transaction)
  ).resolves.toBeUndefined();
  expect(current.db.createObjectStore).not.toHaveBeenCalled();
  expect(current.transaction.objectStore).not.toHaveBeenCalled();
});

it('aborts partial versionchange work and retries from the unchanged v25 database', async () => {
  const durable = createInitialEntries();
  const failed = createTransactionalUpgradeHarness(durable, {
    failDelete: { key: 'project-asset-recording', storeName: 'video_projects' },
  });

  await handleDatabaseUpgrade(failed.db, 25, null, failed.transaction);

  expect(failed.transaction.abort).toHaveBeenCalledOnce();
  expect(durable.get('recordings')).toHaveLength(1);
  expect(durable.get('project_exports')).toEqual([{ id: 'export-1', recordingId: 'recording-1' }]);
  expect(durable.has('asset_refs')).toBe(false);

  const reopened = createTransactionalUpgradeHarness(durable);
  await handleDatabaseUpgrade(reopened.db, 25, null, reopened.transaction);
  expect(reopened.transaction.abort).not.toHaveBeenCalled();
  reopened.commit();

  expect(durable.get('recordings')).toEqual([]);
  expect(durable.has('asset_refs')).toBe(true);
  expect(durable.get('project_exports')).toEqual([]);
  expect(durable.get('video_projects')).toEqual([
    expect.objectContaining({ id: 'project-retained' }),
  ]);
});

function createTransactionalUpgradeHarness(
  durable: Map<string, unknown[]>,
  options: { failDelete?: { key: IDBValidKey; storeName: string } } = {}
) {
  const working = new Map(
    [...durable].map(([name, entries]) => [name, structuredClone(entries)] as const)
  );
  let injectedFailurePending = Boolean(options.failDelete);
  let aborted = false;
  const transaction = {
    abort: vi.fn(() => {
      aborted = true;
    }),
    objectStore(name: string) {
      if (!working.has(name)) working.set(name, []);
      return {
        async clear() {
          working.set(name, []);
        },
        async delete(key: IDBValidKey) {
          if (
            injectedFailurePending &&
            options.failDelete?.storeName === name &&
            options.failDelete.key === key
          ) {
            injectedFailurePending = false;
            throw new Error('injected versionchange delete failure');
          }
          working.set(
            name,
            (working.get(name) ?? []).filter((entry) =>
              typeof entry === 'object' && entry !== null && 'id' in entry
                ? (entry as { id: unknown }).id !== key
                : true
            )
          );
        },
        async getAll() {
          return structuredClone(working.get(name) ?? []);
        },
        async put(value: unknown) {
          const entries = working.get(name) ?? [];
          entries.push(structuredClone(value));
          working.set(name, entries);
        },
      };
    },
  };
  const storeNames = {
    contains: (name: string) => working.has(name),
  };
  const db = {
    createObjectStore(name: string) {
      working.set(name, []);
      return { createIndex: vi.fn() };
    },
    deleteObjectStore(name: string) {
      working.delete(name);
    },
    objectStoreNames: storeNames,
  };
  return {
    commit() {
      if (aborted) throw new Error('Cannot commit an aborted versionchange transaction.');
      durable.clear();
      for (const [name, entries] of working) durable.set(name, structuredClone(entries));
    },
    db,
    transaction,
  };
}
