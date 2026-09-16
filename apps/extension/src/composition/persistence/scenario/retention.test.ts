import { beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/public';
const io = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  abort: vi.fn(),
  assets: vi.fn(),
  documents: vi.fn(),
  apply: vi.fn(),
  finish: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/core', () => ({
  SCENARIO_PROJECTS_STORE: 'projects',
  SCENARIO_ASSETS_STORE: 'assets',
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'documents',
  ASSET_REFS_STORE: 'refs',
  ASSET_OWNERS_STORE: 'owners',
  ASSET_OPERATIONS_STORE: 'operations',
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (effect: (db: unknown) => Promise<unknown>) =>
    effect({
      transaction: () => ({
        abort: io.abort,
        done: Promise.resolve(),
        objectStore: (name: string) => ({
          get: io.get,
          put: io.put,
          index: () => ({ getAll: name === 'assets' ? io.assets : io.documents }),
        }),
      }),
    }),
}));
vi.mock('./aggregate-mutations', () => ({
  recoverScenarioAssetPublications: async () => 0,
  applyScenarioAssetMutations: io.apply,
}));
vi.mock('./editor-document-staging', () => ({ applyScenarioDocumentMutations: io.apply }));
vi.mock('./resource-sessions', () => ({
  tryScenarioResourceCleanup: async (_id: string, operation: () => Promise<unknown>) => operation(),
}));
vi.mock('../assets', () => ({
  buildPhysicalDeleteOperation: () => ({ assetIds: [] }),
  completePhysicalDeleteOperation: io.finish,
}));
vi.mock('../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: io.publish,
}));
import { clearScenarioSavedHistory, pruneScenarioResources } from './retention';
beforeEach(() => {
  vi.clearAllMocks();
  io.put.mockResolvedValue(undefined);
  io.assets.mockResolvedValue([]);
  io.documents.mockResolvedValue([]);
  const project = createGuideProject('Current', 'guide', 2);
  io.get.mockResolvedValue({
    id: 'guide',
    project,
    createdAt: 1,
    updatedAt: 2,
    workspaceRevision: 2,
    history: [{ revision: 1, savedAt: 1, project: { ...project, updatedAt: 1 } }],
  });
});
it('aborts a failed history publication and never announces acceptance', async () => {
  io.put.mockRejectedValueOnce(new Error('quota'));
  await expect(clearScenarioSavedHistory('guide', 2)).rejects.toThrow('quota');
  expect(io.abort).toHaveBeenCalledOnce();
  expect(io.publish).not.toHaveBeenCalled();
  expect(io.apply).not.toHaveBeenCalled();
});
it('rejects invalid child records before deleting anything and aborts the transaction', async () => {
  io.assets.mockResolvedValueOnce([{ id: 'broken', projectId: 'guide' }]);
  await expect(pruneScenarioResources('guide')).rejects.toThrow('Invalid guide children');
  expect(io.abort).toHaveBeenCalledOnce();
  expect(io.apply).not.toHaveBeenCalled();
  expect(io.put).not.toHaveBeenCalled();
  expect(io.finish).not.toHaveBeenCalled();
});
it('does not prune an unsupported root and treats an absent root as no work', async () => {
  io.get.mockResolvedValueOnce({ id: 'guide', project: { version: 3 } });
  await expect(pruneScenarioResources('guide')).rejects.toThrow('Unavailable guide');
  io.get.mockResolvedValueOnce(undefined);
  expect(await pruneScenarioResources('guide')).toBe(0);
  expect(io.apply).not.toHaveBeenCalled();
});
