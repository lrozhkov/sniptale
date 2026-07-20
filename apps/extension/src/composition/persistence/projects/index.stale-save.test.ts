import { beforeEach, expect, it, vi } from 'vitest';
import {
  createVideoProject,
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support.ts';

const projectsDbMocks = vi.hoisted(() => ({
  dbGetMock: vi.fn(),
  initDBMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txGetAllMock: vi.fn(),
  txGetMock: vi.fn(),
  txPutMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_ASSETS_STORE: 'project_assets',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: projectsDbMocks.initDBMock,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal()),
  publishMediaHubLibraryChanged: projectsDbMocks.publishMediaHubLibraryChangedMock,
}));

vi.mock('../media-library/entry-mapping', async (importOriginal) => ({
  ...(await importOriginal()),
  createProjectAssetMediaId: (id: string) => `project-asset:${id}`,
}));

function createDb() {
  return {
    get: projectsDbMocks.dbGetMock,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        delete: projectsDbMocks.txDeleteMock,
        getAll: projectsDbMocks.txGetAllMock,
        get: projectsDbMocks.txGetMock,
        put: projectsDbMocks.txPutMock,
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  projectsDbMocks.initDBMock.mockResolvedValue(createDb());
  projectsDbMocks.txGetAllMock.mockResolvedValue([]);
});

async function importProjectsDbModule() {
  vi.resetModules();
  return import('./index');
}

it('rejects stale video project saves inside the write transaction before writes or publication', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ updatedAt: 10 });
  projectsDbMocks.dbGetMock.mockResolvedValue(createVideoProjectEntry({ updatedAt: 10 }));
  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry({ updatedAt: 20 }));

  await expect(saveVideoProject(project, { baseUpdatedAt: 10 })).rejects.toThrow(
    'Video project project-1 was changed before this save completed'
  );

  expect(projectsDbMocks.dbGetMock).not.toHaveBeenCalledWith('video_projects', 'project-1');
  expect(projectsDbMocks.txGetMock).toHaveBeenCalledWith('project-1');
  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('removes project-owned assets that are no longer referenced by the saved project', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ updatedAt: 10 });
  projectsDbMocks.txGetMock.mockResolvedValue(
    createVideoProjectEntryWithMediaClip({ updatedAt: 10 })
  );

  await saveVideoProject(project, { baseUpdatedAt: 10 });

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project-1' })
  );
  expect(projectsDbMocks.txDeleteMock).toHaveBeenNthCalledWith(1, 'project-asset-1');
  expect(projectsDbMocks.txDeleteMock).toHaveBeenNthCalledWith(2, 'project-asset:project-asset-1');
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    'video-project:project-1',
  ]);
});

it('publishes a create event when saving a new video project', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ id: 'project-new' });
  projectsDbMocks.txGetMock.mockResolvedValue(undefined);

  await saveVideoProject(project);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project-new' })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('create', [
    'video-project:project-new',
  ]);
});

it('preserves persisted project-owned assets when saving an older project snapshot', async () => {
  const { saveVideoProject } = await importProjectsDbModule();
  const project = createVideoProject({ updatedAt: 10 });
  projectsDbMocks.txGetMock.mockResolvedValue(
    createVideoProjectEntryWithMediaClip({ updatedAt: 20 })
  );

  await saveVideoProject(project);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({
        assets: [expect.objectContaining({ id: expect.any(String) })],
      }),
    })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    'video-project:project-1',
  ]);
});
