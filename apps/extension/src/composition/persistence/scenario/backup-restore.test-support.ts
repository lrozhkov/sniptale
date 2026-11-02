import { expect, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/factories';
import { projectRowReferenceKeys } from '../assets/retention-index-projection';
import { ROW_REFERENCE_INDEX } from '../infrastructure/indexed-db/row-index-contract';
import type { ScenarioProjectEntry } from './contracts';
import type {
  putScenarioProjectBackupRestore,
  ScenarioBackupRestoreStores,
} from './backup-restore';

function store(get: (key: IDBValidKey) => unknown = () => undefined) {
  return { delete: vi.fn(), get: vi.fn(async (key) => get(key)), put: vi.fn() };
}

function indexStore() {
  return { ...store(), index: vi.fn(() => ({ getAll: vi.fn(async () => []) })) };
}

export function stores(): ScenarioBackupRestoreStores {
  return {
    assets: indexStore(),
    exports: indexStore(),
    operations: store(),
    owners: { ...store(), index: vi.fn(() => ({ count: vi.fn(async () => 0) })) },
    presentations: store(),
    projects: store(),
    refs: store(),
    stepDocuments: indexStore(),
    thumbnails: store(),
  } satisfies ScenarioBackupRestoreStores;
}

export function projectEntry(id = 'project'): ScenarioProjectEntry {
  const project = { ...createGuideProject('Scenario'), id };
  return {
    createdAt: project.createdAt,
    id,
    project,
    updatedAt: project.updatedAt,
    workspaceRevision: 1,
  };
}

export const operation = () => ({
  assetIds: [],
  createdAt: 1,
  kind: 'physical-delete' as const,
  operationId: 'delete',
  status: 'pending' as const,
  updatedAt: 1,
});
export const ref = {
  assetId: 'local',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/local' },
  mimeType: 'image/png',
  sha256: null,
  size: 1,
};

export function restoreTransaction(
  target: ScenarioBackupRestoreStores,
  videos: unknown[] = [],
  queries = vi.fn()
) {
  const graph = {
    get: async () => undefined,
    getAll: async () => [],
    put: async () => undefined,
    index: () => ({ getAll: async () => [] }),
  };
  const stores = {
    scenario_assets: target.assets,
    scenario_exports: target.exports,
    scenario_projects: target.projects,
    scenario_step_editor_documents: target.stepDocuments,
    asset_owners: target.owners,
    asset_refs: target.refs,
    media_library: graph,
    recordings: graph,
    project_assets: graph,
    video_projects: {
      ...graph,
      getAll: async () => {
        throw new Error('Global video dependency read');
      },
      index: (name: string) => {
        expect(name).toBe(ROW_REFERENCE_INDEX);
        return {
          getAll: async (key: string) => {
            queries(key);
            return videos.filter((row) =>
              projectRowReferenceKeys('video_projects', row).includes(key)
            );
          },
        };
      },
    },
  };
  return { objectStore: (name: keyof typeof stores) => stores[name] } as unknown as Parameters<
    typeof putScenarioProjectBackupRestore
  >[0]['tx'];
}
