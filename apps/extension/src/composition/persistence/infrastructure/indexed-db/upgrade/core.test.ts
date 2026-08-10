import { expect, it, vi } from 'vitest';
import { handleDatabaseUpgrade } from './core.ts';

const COMPLETE_STORES = [
  'recordings',
  'recording_telemetry',
  'diagnostics_meta',
  'diagnostics_events',
  'video_projects',
  'project_assets',
  'project_exports',
  'media_library',
  'thumbnails',
  'image_workspaces',
  'aggregate_presentations',
  'scenario_projects',
  'scenario_assets',
  'scenario_pending_assets',
  'scenario_exports',
  'scenario_step_editor_documents',
  'web_snapshots',
  'video_effect_bundles',
  'project_export_inputs',
  'editor_custom_shapes',
  'state_manager',
  'native_transfer_sessions',
  'native_transfer_chunks',
  'frame_annotation_raster_jobs',
];

it('creates stores for the expected schema versions', () => {
  const upgradeDb = createMockDb();

  handleDatabaseUpgrade(upgradeDb, 0);

  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('recordings', { keyPath: 'id' });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('recording_telemetry', {
    keyPath: 'recordingId',
  });
  expect(upgradeDb.deleteObjectStore).toHaveBeenCalledWith('editor_sessions');
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('image_workspaces', {
    keyPath: 'aggregateId',
  });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('aggregate_presentations', {
    keyPath: ['aggregateKind', 'aggregateId'],
  });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('web_snapshots', { keyPath: 'id' });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('video_effect_bundles', {
    keyPath: 'packId',
  });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('project_export_inputs', {
    keyPath: 'jobId',
  });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('editor_custom_shapes', {
    keyPath: 'id',
  });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('state_manager', {
    keyPath: ['domain', 'key'],
  });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('native_transfer_sessions', {
    keyPath: 'id',
  });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('native_transfer_chunks', {
    keyPath: ['sessionId', 'chunkIndex'],
  });
  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('frame_annotation_raster_jobs', {
    keyPath: 'jobId',
  });
});

it('replaces the engine1 template pack store without migrating executable data in v20', () => {
  const legacyDb = createMockDb([
    ...COMPLETE_STORES.filter((store) => store !== 'video_effect_bundles'),
    'video_template_packs',
  ]);

  handleDatabaseUpgrade(legacyDb, 19);

  expect(legacyDb.deleteObjectStore).toHaveBeenCalledWith('video_template_packs');
  expect(legacyDb.createObjectStore).toHaveBeenCalledWith('video_effect_bundles', {
    keyPath: 'packId',
  });
  expect(legacyDb.objectStoreNames).not.toContain('video_template_packs');
  expect(legacyDb.objectStoreNames).toContain('video_effect_bundles');
});

it('creates native transfer indexes during the v19 upgrade', () => {
  const upgradeDb = createMockDb(COMPLETE_STORES.filter((store) => !store.startsWith('native_')));

  handleDatabaseUpgrade(upgradeDb, 18);

  expect(upgradeDb.storeIndexes.get('native_transfer_sessions')?.createIndex).toHaveBeenCalledWith(
    'createdAt',
    'createdAt'
  );
  expect(upgradeDb.storeIndexes.get('native_transfer_sessions')?.createIndex).toHaveBeenCalledWith(
    'updatedAt',
    'updatedAt'
  );
  expect(upgradeDb.storeIndexes.get('native_transfer_chunks')?.createIndex).toHaveBeenCalledWith(
    'sessionId',
    'sessionId'
  );
});

it('creates the job-scoped project export input handoff during the v21 upgrade', () => {
  const upgradeDb = createMockDb(
    COMPLETE_STORES.filter((store) => store !== 'project_export_inputs')
  );

  handleDatabaseUpgrade(upgradeDb, 20);

  expect(upgradeDb.createObjectStore).toHaveBeenCalledWith('project_export_inputs', {
    keyPath: 'jobId',
  });
  expect(upgradeDb.storeIndexes.get('project_export_inputs')?.createIndex).toHaveBeenCalledWith(
    'createdAt',
    'createdAt'
  );
});

it('skips store creation when existing stores already cover the upgrade', () => {
  const existingDb = createMockDb(COMPLETE_STORES);

  handleDatabaseUpgrade(existingDb, 24);

  expect(existingDb.createObjectStore).not.toHaveBeenCalled();
});

it('replaces editor sessions with aggregate-owned image stores during the v24 upgrade', () => {
  const legacyDb = createMockDb([
    ...COMPLETE_STORES.filter(
      (store) => store !== 'image_workspaces' && store !== 'aggregate_presentations'
    ),
    'editor_sessions',
  ]);

  handleDatabaseUpgrade(legacyDb, 23);

  expect(legacyDb.deleteObjectStore).toHaveBeenCalledWith('editor_sessions');
  expect(legacyDb.objectStoreNames).not.toContain('editor_sessions');
  expect(legacyDb.objectStoreNames).toContain('image_workspaces');
  expect(legacyDb.objectStoreNames).toContain('aggregate_presentations');
  expect(legacyDb.storeIndexes.get('image_workspaces')?.createIndex).toHaveBeenCalledWith(
    'updatedAt',
    'updatedAt'
  );
  expect(legacyDb.storeIndexes.get('aggregate_presentations')?.createIndex).toHaveBeenCalledWith(
    'updatedAt',
    'updatedAt'
  );
});

it('removes the legacy annotation pack store during the v16 upgrade', () => {
  const legacyDb = createMockDb([...COMPLETE_STORES, 'annotation_packs']);

  handleDatabaseUpgrade(legacyDb, 15);

  expect(legacyDb.deleteObjectStore).toHaveBeenCalledWith('annotation_packs');
  expect(legacyDb.objectStoreNames).not.toContain('annotation_packs');
});

it('destructively removes the retired page style asset store during the v22 upgrade', () => {
  const legacyDb = createMockDb([...COMPLETE_STORES, 'page_style_assets']);

  handleDatabaseUpgrade(legacyDb, 21);

  expect(legacyDb.deleteObjectStore).toHaveBeenCalledWith('page_style_assets');
  expect(legacyDb.objectStoreNames).not.toContain('page_style_assets');
});

function createMockDb(initialStores: readonly string[] = []) {
  const storeNames = createStoreNames(initialStores);
  const storeIndexes = new Map<string, { createIndex: ReturnType<typeof vi.fn> }>();

  return {
    createObjectStore: vi.fn((name: string) => {
      if (!storeNames.includes(name)) {
        storeNames.push(name);
      }

      const store = { createIndex: vi.fn() };
      storeIndexes.set(name, store);
      return store;
    }),
    deleteObjectStore: vi.fn((name: string) => {
      const index = storeNames.indexOf(name);
      if (index >= 0) {
        storeNames.splice(index, 1);
      }
    }),
    objectStoreNames: storeNames,
    storeIndexes,
  };
}

function createStoreNames(initialStores: readonly string[]) {
  const storeNames = [...initialStores] as string[] & { contains(name: string): boolean };
  storeNames.contains = (name: string) => storeNames.includes(name);
  return storeNames;
}
