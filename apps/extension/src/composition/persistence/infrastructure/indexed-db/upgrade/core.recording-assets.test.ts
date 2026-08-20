import { expect, it, vi } from 'vitest';
import { applyRecordingAssetsV26Upgrade } from './core.recording-assets';

function createUpgradeHarness() {
  const initial = new Map<string, unknown[]>([
    ['recordings', [{ id: 'recording-1', blob: new Blob(['legacy']) }]],
    [
      'video_projects',
      [
        {
          id: 'project-invalid',
          project: {
            assets: [
              { source: { kind: 'project-asset', projectAssetId: 'temporary-only' } },
              { source: { kind: 'project-asset', projectAssetId: 'shared' } },
            ],
            baseRecordingId: 'recording-1',
          },
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
      ],
    ],
    ['project_exports', [{ id: 'export-1', recordingId: 'recording-1' }]],
  ]);
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const transaction = {
    abort: vi.fn(),
    objectStore(name: string) {
      let store = stores.get(name);
      if (!store) {
        store = createStore(initial.get(name) ?? []);
        stores.set(name, store);
      }
      return store;
    },
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
  expect(harness.stores.get('video_projects')?.delete).toHaveBeenCalledWith('project-invalid');
  expect(harness.stores.get('project_exports')?.delete).toHaveBeenCalledWith('export-1');
  expect(harness.stores.get('video_projects')?.delete).not.toHaveBeenCalledWith('project-retained');
  expect(harness.stores.get('project_assets')?.delete).toHaveBeenCalledWith('temporary-only');
  expect(harness.stores.get('project_assets')?.delete).not.toHaveBeenCalledWith('shared');
  expect(harness.stores.get('media_library')?.delete).toHaveBeenCalledWith('recording:recording-1');
  expect(harness.stores.get('aggregate_presentations')?.delete).toHaveBeenCalledWith([
    'video-project',
    'project-invalid',
  ]);
});
