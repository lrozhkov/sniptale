import { expect, it, vi } from 'vitest';
import { applyProjectMediaV27Upgrade } from './core.project-media';

it('resets only legacy project media and records OPFS deletion after the v27 upgrade', async () => {
  const harness = createHarness();

  await applyProjectMediaV27Upgrade(26, harness.transaction);

  expect(harness.stores.get('project_assets')?.clear).toHaveBeenCalledOnce();
  expect(harness.stores.get('project_exports')?.clear).toHaveBeenCalledOnce();
  expect(harness.stores.get('video_projects')?.delete).toHaveBeenCalledWith('project-invalid');
  expect(harness.stores.get('video_projects')?.delete).not.toHaveBeenCalledWith('project-retained');
  expect(harness.stores.get('recordings')?.delete).toHaveBeenCalledWith('export-recording');
  expect(harness.stores.get('recordings')?.delete).not.toHaveBeenCalledWith('library-recording');
  expect(harness.stores.get('media_library')?.delete).toHaveBeenCalledWith('export:export-1');
  expect(harness.stores.get('media_library')?.delete).toHaveBeenCalledWith(
    'recording:export-recording'
  );
  expect(harness.stores.get('asset_owners')?.delete).toHaveBeenCalledWith([
    'recording',
    'export-recording',
    'body',
  ]);
  expect(harness.stores.get('asset_refs')?.delete).toHaveBeenCalledWith('asset-export-alias');
  expect(harness.stores.get('asset_operations')?.put).toHaveBeenCalledWith(
    expect.objectContaining({
      assetIds: ['asset-export-alias'],
      kind: 'physical-delete',
      operationId: 'v27-project-media-reset',
      status: 'pending',
    })
  );
});

it('is a no-op for a new database and already upgraded databases', async () => {
  const transaction = { abort: vi.fn(), objectStore: vi.fn() };

  await expect(applyProjectMediaV27Upgrade(0, transaction)).resolves.toBeUndefined();
  await expect(applyProjectMediaV27Upgrade(27, transaction)).resolves.toBeUndefined();
  expect(transaction.objectStore).not.toHaveBeenCalled();
});

function createHarness() {
  const initial = new Map<string, unknown[]>([
    ['project_assets', [{ id: 'project-asset-1', blob: new Blob(['legacy']) }]],
    ['project_exports', [{ id: 'export-1', recordingId: 'export-recording' }]],
    [
      'video_projects',
      [
        {
          id: 'project-invalid',
          project: {
            assets: [{ source: { kind: 'project-asset', projectAssetId: 'project-asset-1' } }],
          },
        },
        { id: 'project-retained', project: { assets: [] } },
      ],
    ],
    [
      'recordings',
      [
        { assetId: 'asset-export-alias', id: 'export-recording' },
        { assetId: 'asset-library', id: 'library-recording' },
      ],
    ],
    [
      'media_library',
      [
        {
          id: 'project-asset:project-asset-1',
          source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
        },
        {
          id: 'export:export-1',
          source: { exportId: 'export-1', kind: 'project-export' },
        },
        {
          id: 'recording:export-recording',
          source: { kind: 'recording', recordingId: 'export-recording' },
        },
        {
          id: 'recording:library-recording',
          source: { kind: 'recording', recordingId: 'library-recording' },
        },
      ],
    ],
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
  return { stores, transaction };
}

function createStore(entries: unknown[]) {
  return {
    clear: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue(entries),
    put: vi.fn().mockResolvedValue(undefined),
  };
}
