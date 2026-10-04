import { beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../../features/scenario/project/factories';
const io = vi.hoisted(() => ({
  get: vi.fn(),
  transaction: vi.fn(),
  read: vi.fn(),
  recover: vi.fn(),
}));
vi.mock('../../infrastructure/indexed-db/core', () => ({
  initDB: async () => ({ get: io.get, transaction: io.transaction }),
  SCENARIO_PROJECTS_STORE: 'projects',
  SCENARIO_ASSETS_STORE: 'assets',
  ASSET_REFS_STORE: 'refs',
}));
vi.mock('../../assets', () => ({
  parseAssetRef: (value: unknown) => value,
  readAssetFile: io.read,
}));
vi.mock('../aggregate-mutations', () => ({ recoverScenarioAssetPublications: io.recover }));
import { readScenarioViewingSnapshot, readScenarioViewingAsset } from './viewing';
beforeEach(() => vi.resetAllMocks());
it('reads the committed revision without recovery or writes and rejects unavailable roots', async () => {
  const project = createGuideProject('Guide');
  const entry = { id: project.id, project, createdAt: 1, updatedAt: 1, workspaceRevision: 7 };
  io.get.mockResolvedValue(entry);
  expect(await readScenarioViewingSnapshot(project.id)).toEqual({ project, revision: 7 });
  for (const raw of [
    undefined,
    { ...entry, project: { ...project, version: 99 } },
    { ...entry, lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1, trashedAt: 2 } },
  ]) {
    io.get.mockResolvedValue(raw);
    expect(await readScenarioViewingSnapshot(project.id)).toBeNull();
  }
  expect(io.recover).not.toHaveBeenCalled();
  expect(io.transaction).not.toHaveBeenCalled();
});
it('restricts media to the selected project and opens only a readonly transaction', async () => {
  const entry = {
    id: 'image',
    assetId: 'object',
    projectId: 'project',
    galleryAssetId: null,
    mimeType: 'image/png',
    width: 10,
    height: 10,
    size: 10,
    createdAt: 1,
  };
  const get = vi.fn().mockResolvedValueOnce(entry).mockResolvedValueOnce({ id: 'object' });
  io.transaction.mockReturnValue({ objectStore: () => ({ get }), done: Promise.resolve() });
  io.read.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  expect(await readScenarioViewingAsset('project', 'image')).toBeInstanceOf(Blob);
  expect(io.transaction).toHaveBeenCalledWith(['assets', 'refs'], 'readonly');
  get.mockResolvedValue(entry);
  expect(await readScenarioViewingAsset('other', 'image')).toBeUndefined();
  expect(io.read).toHaveBeenCalledTimes(1);
  expect(io.recover).not.toHaveBeenCalled();
});
