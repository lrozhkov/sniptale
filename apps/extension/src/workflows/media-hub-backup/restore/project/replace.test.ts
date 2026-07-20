import { describe, expect, it, vi } from 'vitest';
import type { getStore } from '../../storage';

type BackupTransaction = Parameters<typeof getStore>[0];

function createStore(entries: unknown[] = []) {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    index: vi.fn(() => ({
      getAll: vi.fn(async () => entries),
    })),
    put: vi.fn(),
  };
}

function createTransaction(stores: Map<string, ReturnType<typeof createStore>>): BackupTransaction {
  return {
    objectStore: (name) => {
      const store = stores.get(name);

      if (!store) {
        throw new Error(`Unknown store ${name}`);
      }

      return store;
    },
  };
}

function createStores() {
  return new Map([
    ['media_library', createStore()],
    ['project_assets', createStore()],
    ['project_exports', createStore([createStaleProjectExport()])],
    ['recording_telemetry', createStore()],
    ['recordings', createStore()],
    [
      'scenario_assets',
      createStore([{ id: 'stale-scenario-asset' }, { blob: 'broken', id: 'broken-asset' }]),
    ],
    [
      'scenario_exports',
      createStore([{ id: 'stale-scenario-export' }, { format: 'pdf', id: 'broken-export' }]),
    ],
    [
      'scenario_step_editor_documents',
      createStore([{ stepId: 'stale-step' }, { document: 'broken', stepId: 'broken-step' }]),
    ],
    ['thumbnails', createStore()],
    ['video_projects', createStore()],
  ]);
}

function createStaleProjectExport() {
  return {
    id: 'stale-export',
    recordingId: 'stale-recording',
  };
}

describe('backup project replace cleanup', () => {
  it('validates project replace preflight ids before writes', async () => {
    const { assertBackupProjectReplacePreflightComplete } = await import('./replace');

    expect(() => assertBackupProjectReplacePreflightComplete('project-1')).not.toThrow();
    expect(() => assertBackupProjectReplacePreflightComplete('')).toThrow(
      'Backup project replace preflight is incomplete.'
    );
  });

  it('clears stale video project children before replacing a v2 bundle', async () => {
    const stores = createStores();
    stores.get('video_projects')?.get.mockResolvedValue({
      project: {
        assets: [
          { source: { kind: 'recording', recordingId: 'kept-recording' } },
          { source: { kind: 'project-asset', projectAssetId: 'stale-project-asset' } },
        ],
      },
    });
    const { deleteExistingVideoProjectBundle } = await import('./replace');

    await deleteExistingVideoProjectBundle(createTransaction(stores), 'video-1');

    expect(stores.get('project_assets')?.delete).toHaveBeenCalledWith('stale-project-asset');
    expect(stores.get('project_exports')?.delete).toHaveBeenCalledWith('stale-export');
    expect(stores.get('recordings')?.delete).toHaveBeenCalledWith('stale-recording');
    expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('export:stale-export');
    expect(stores.get('thumbnails')?.delete).toHaveBeenCalledWith('video-project:video-1');
  });

  it('clears stale video exports when the old project row is already missing', async () => {
    const stores = createStores();
    const { deleteExistingVideoProjectBundle } = await import('./replace');

    await deleteExistingVideoProjectBundle(createTransaction(stores), 'video-missing');

    expect(stores.get('project_assets')?.delete).not.toHaveBeenCalled();
    expect(stores.get('project_exports')?.delete).toHaveBeenCalledWith('stale-export');
    expect(stores.get('thumbnails')?.delete).toHaveBeenCalledWith('video-project:video-missing');
  });
});

describe('backup scenario project replace cleanup', () => {
  it('clears stale scenario project children before replacing a v2 bundle', async () => {
    const stores = createStores();
    const { deleteExistingScenarioProjectBundle } = await import('./replace');

    await deleteExistingScenarioProjectBundle(createTransaction(stores), 'scenario-1');

    expect(stores.get('scenario_assets')?.delete).toHaveBeenCalledWith('stale-scenario-asset');
    expect(stores.get('scenario_assets')?.delete).toHaveBeenCalledWith('broken-asset');
    expect(stores.get('scenario_exports')?.delete).toHaveBeenCalledWith('stale-scenario-export');
    expect(stores.get('scenario_exports')?.delete).toHaveBeenCalledWith('broken-export');
    expect(stores.get('scenario_step_editor_documents')?.delete).toHaveBeenCalledWith('stale-step');
    expect(stores.get('scenario_step_editor_documents')?.delete).toHaveBeenCalledWith(
      'broken-step'
    );
    expect(stores.get('thumbnails')?.delete).toHaveBeenCalledWith('scenario:scenario-1');
  });
});
