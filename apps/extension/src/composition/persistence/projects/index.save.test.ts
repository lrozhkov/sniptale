import { beforeEach, expect, it, vi } from 'vitest';
import {
  VideoProjectAssetType,
  type VideoProjectAsset,
} from '../../../features/video/project/types/index';
import { createVideoProject, createVideoProjectEntry } from './index.test-support.ts';

const projectsDbMocks = vi.hoisted(() => ({
  buildProjectAssetMediaEntryMock: vi.fn(),
  buildProjectExportMediaEntryMock: vi.fn(),
  buildRecordingMediaEntryMock: vi.fn(),
  createProjectAssetMediaIdMock: vi.fn(),
  createRecordingMediaIdMock: vi.fn(),
  dbGetMock: vi.fn(),
  getRecordingMock: vi.fn(),
  initDBMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txGetAllMock: vi.fn(),
  txGetMock: vi.fn(),
  txPutMock: vi.fn(),
  upsertMediaEntryMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_ASSETS_STORE: 'project_assets',
  PROJECT_EXPORTS_STORE: 'project_exports',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: projectsDbMocks.initDBMock,
}));

vi.mock('../media-library/entry-mapping', async (importOriginal) => ({
  ...(await importOriginal()),
  buildProjectAssetMediaEntry: projectsDbMocks.buildProjectAssetMediaEntryMock,
  buildProjectExportMediaEntry: projectsDbMocks.buildProjectExportMediaEntryMock,
  buildRecordingMediaEntry: projectsDbMocks.buildRecordingMediaEntryMock,
  createProjectAssetMediaId: projectsDbMocks.createProjectAssetMediaIdMock,
  createRecordingMediaId: projectsDbMocks.createRecordingMediaIdMock,
}));

vi.mock('../media-library/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library/store')>()),
  upsertMediaEntry: projectsDbMocks.upsertMediaEntryMock,
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecording: projectsDbMocks.getRecordingMock,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal()),
  publishMediaHubLibraryChanged: projectsDbMocks.publishMediaHubLibraryChangedMock,
}));

function createDb() {
  return {
    get: projectsDbMocks.dbGetMock,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        delete: projectsDbMocks.txDeleteMock,
        get: projectsDbMocks.txGetMock,
        getAll: projectsDbMocks.txGetAllMock,
        put: projectsDbMocks.txPutMock,
      })),
    })),
  };
}

function createProjectOwnedVideoAsset(id: string) {
  return {
    id,
    type: VideoProjectAssetType.VIDEO,
    name: `${id}.mp4`,
    source: { kind: 'project-asset' as const, projectAssetId: id },
    metadata: {
      width: 1280,
      height: 720,
      duration: 5,
      mimeType: 'video/mp4',
      size: 20,
      hasAudio: false,
      audioPeaks: null,
    },
    createdAt: 100,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  projectsDbMocks.initDBMock.mockResolvedValue(createDb());
  projectsDbMocks.createProjectAssetMediaIdMock.mockImplementation(
    (id: string) => `project-asset:${id}`
  );
  projectsDbMocks.createRecordingMediaIdMock.mockImplementation((id: string) => `recording:${id}`);
  projectsDbMocks.upsertMediaEntryMock.mockResolvedValue(undefined);
  projectsDbMocks.getRecordingMock.mockResolvedValue(undefined);
  projectsDbMocks.txGetAllMock.mockResolvedValue([]);
});

it('deletes removed project-owned assets while saving the next project snapshot', async () => {
  const { saveVideoProject } = await import('./index');
  const existingProject = createVideoProject({
    assets: [createProjectOwnedVideoAsset('asset-a'), createProjectOwnedVideoAsset('asset-b')],
  });
  const nextProject = {
    ...existingProject,
    assets: [existingProject.assets[0]!],
  };

  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(existingProject));
  vi.spyOn(Date, 'now').mockReturnValue(1000);

  await saveVideoProject(nextProject);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'project-1',
      updatedAt: 1000,
    })
  );
  expect(projectsDbMocks.txDeleteMock).toHaveBeenCalledWith('asset-b');
  expect(projectsDbMocks.txDeleteMock).toHaveBeenCalledWith('project-asset:asset-b');
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    'video-project:project-1',
  ]);
});

it('preserves removed project-owned assets while another project references them', async () => {
  const { saveVideoProject } = await import('./index');
  const sharedAsset = createProjectOwnedVideoAsset('asset-shared');
  const existingProject = createVideoProject({ assets: [sharedAsset] });
  const nextProject = { ...existingProject, assets: [] };

  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(existingProject));
  projectsDbMocks.txGetAllMock.mockResolvedValue([
    createVideoProjectEntry(existingProject),
    createVideoProjectEntry({ assets: [sharedAsset], id: 'project-2' }, { id: 'project-2' }),
  ]);

  await saveVideoProject(nextProject);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project-1' })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('asset-shared');
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalledWith('project-asset:asset-shared');
});

it('preserves newer persisted project-owned assets for legacy unguarded saves', async () => {
  const { saveVideoProject } = await import('./index');
  const existingProject = createVideoProject({
    assets: [createProjectOwnedVideoAsset('asset-a'), createProjectOwnedVideoAsset('asset-b')],
    updatedAt: 500,
  });
  const staleProject = {
    ...existingProject,
    assets: [existingProject.assets[0]!],
    updatedAt: 100,
  };

  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(existingProject));
  vi.spyOn(Date, 'now').mockReturnValue(1000);

  await saveVideoProject(staleProject);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({
        assets: [
          expect.objectContaining({ id: 'asset-a' }),
          expect.objectContaining({ id: 'asset-b' }),
        ],
      }),
    })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
});

it('rejects stale video project saves before any write when the base revision changed', async () => {
  const { saveVideoProject } = await import('./index');
  const existingProject = createVideoProject({
    assets: [createProjectOwnedVideoAsset('asset-a'), createProjectOwnedVideoAsset('asset-b')],
    name: 'Newer name',
    updatedAt: 500,
  });
  const staleProject = {
    ...existingProject,
    assets: [existingProject.assets[0]!],
    name: 'Stale name',
    updatedAt: 100,
  };

  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(existingProject));

  await expect(saveVideoProject(staleProject, { baseUpdatedAt: 100 })).rejects.toThrow(
    'Video project project-1 was changed before this save completed'
  );

  expect(projectsDbMocks.txPutMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
  expect(projectsDbMocks.publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('commits video project mutations with the supplied base revision', async () => {
  const { commitVideoProjectMutation } = await import('./index-mutations');
  const existingProject = createVideoProject({
    assets: [createProjectOwnedVideoAsset('asset-a'), createProjectOwnedVideoAsset('asset-b')],
    updatedAt: 500,
  });
  const nextProject = {
    ...existingProject,
    name: 'Fresh mutation',
  };

  projectsDbMocks.txGetMock.mockResolvedValue(createVideoProjectEntry(existingProject));
  projectsDbMocks.dbGetMock.mockResolvedValue(
    createVideoProjectEntry({ ...nextProject, updatedAt: 1000 })
  );

  await expect(commitVideoProjectMutation(nextProject, { baseRevision: 500 })).resolves.toEqual(
    expect.objectContaining({ name: 'Fresh mutation', updatedAt: 1000 })
  );

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({
        name: 'Fresh mutation',
      }),
    })
  );
});

it('falls back to the submitted project when mutation read-back is unavailable', async () => {
  const { commitVideoProjectMutation } = await import('./index-mutations');
  const nextProject = createVideoProject({ name: 'Fallback mutation' });

  projectsDbMocks.txGetMock.mockResolvedValue(undefined);
  projectsDbMocks.dbGetMock.mockResolvedValue(undefined);

  await expect(commitVideoProjectMutation(nextProject)).resolves.toEqual(nextProject);
});

it('uses now as createdAt fallback and ignores externally owned assets while saving', async () => {
  const { saveVideoProject } = await import('./index');
  const project = createVideoProject({
    assets: [
      {
        ...createProjectOwnedVideoAsset('external-asset'),
        source: { kind: 'recording', recordingId: 'recording-1' },
      } satisfies VideoProjectAsset,
    ],
  });

  projectsDbMocks.txGetMock.mockResolvedValue(undefined);
  vi.spyOn(Date, 'now').mockReturnValue(2000);
  Reflect.deleteProperty(project, 'createdAt');

  await saveVideoProject(project);

  expect(projectsDbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      createdAt: 2000,
      id: 'project-1',
      updatedAt: 2000,
    })
  );
  expect(projectsDbMocks.txDeleteMock).not.toHaveBeenCalled();
});
