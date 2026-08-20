import { expect, it, vi } from 'vitest';
import { applyScenarioAssetsV28Upgrade } from './core.scenario-assets';

it('resets legacy scenario blobs and only invalidates aggregates that reference them', async () => {
  const harness = createHarness();

  await applyScenarioAssetsV28Upgrade(27, harness.transaction);

  expect(harness.stores.get('scenario_assets')?.clear).toHaveBeenCalledOnce();
  expect(harness.stores.get('scenario_projects')?.delete).toHaveBeenCalledWith('legacy-invalid');
  expect(harness.stores.get('scenario_projects')?.delete).toHaveBeenCalledWith('v3-invalid');
  expect(harness.stores.get('scenario_projects')?.delete).not.toHaveBeenCalledWith('retained');
  expect(harness.stores.get('scenario_step_editor_documents')?.delete).toHaveBeenCalledWith(
    'invalid-step'
  );
  expect(harness.stores.get('scenario_step_editor_documents')?.delete).not.toHaveBeenCalledWith(
    'retained-step'
  );
  expect(harness.stores.get('aggregate_presentations')?.delete).toHaveBeenCalledWith([
    'scenario',
    'v3-invalid',
  ]);
  expect(harness.stores.get('thumbnails')?.delete).toHaveBeenCalledWith('scenario:legacy-invalid');
  expect(harness.stores.has('scenario_pending_assets')).toBe(false);
  expect(harness.stores.has('scenario_exports')).toBe(false);
});

it('is non-destructive for fresh and already upgraded databases', async () => {
  const transaction = { abort: vi.fn(), objectStore: vi.fn() };
  await expect(applyScenarioAssetsV28Upgrade(0, transaction)).resolves.toBeUndefined();
  await expect(applyScenarioAssetsV28Upgrade(28, transaction)).resolves.toBeUndefined();
  expect(transaction.objectStore).not.toHaveBeenCalled();
});

it('surfaces request failures so the versionchange transaction can abort and retry', async () => {
  const harness = createHarness();
  harness.stores.get('scenario_assets')?.clear.mockRejectedValueOnce(new Error('clear failed'));
  await expect(applyScenarioAssetsV28Upgrade(27, harness.transaction)).rejects.toThrow(
    'clear failed'
  );
});

function createHarness() {
  const initial = new Map<string, unknown[]>([
    [
      'scenario_assets',
      [
        { blob: new Blob(['one']), id: 'asset-1' },
        { blob: new Blob(['two']), id: 'asset-2' },
      ],
    ],
    [
      'scenario_projects',
      [
        { id: 'legacy-invalid', project: { steps: [{ assetId: 'asset-1', kind: 'capture' }] } },
        {
          id: 'v3-invalid',
          project: {
            slides: [
              {
                elements: [{ assetRef: { assetId: 'asset-2' }, kind: 'image' }],
                source: { kind: 'manual' },
              },
            ],
            trash: [{ slide: { source: { assetId: 'asset-1', kind: 'capture' } } }],
          },
        },
        { id: 'retained', project: { slides: [], steps: [], trash: [] } },
      ],
    ],
    [
      'scenario_step_editor_documents',
      [
        { projectId: 'legacy-invalid', stepId: 'invalid-step' },
        { projectId: 'retained', stepId: 'retained-step' },
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
  for (const name of initial.keys()) transaction.objectStore(name);
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
