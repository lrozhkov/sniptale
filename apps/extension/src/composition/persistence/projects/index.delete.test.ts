import { beforeEach, expect, it, vi } from 'vitest';
import { VideoProjectAssetType } from '../../../features/video/project/types/index';
import { createVideoProjectEntry } from './index.test-support.ts';

const deleteMocks = vi.hoisted(() => ({
  createProjectAssetMediaIdMock: vi.fn(),
  initDBMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txGetAllMock: vi.fn(),
  txGetMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_ASSETS_STORE: 'project_assets',
  PROJECT_EXPORTS_STORE: 'project_exports',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: deleteMocks.initDBMock,
}));

vi.mock('../media-library/entry-mapping', async (importOriginal) => ({
  ...(await importOriginal()),
  buildProjectAssetMediaEntry: vi.fn(),
  buildProjectExportMediaEntry: vi.fn(),
  buildRecordingMediaEntry: vi.fn(),
  createProjectAssetMediaId: deleteMocks.createProjectAssetMediaIdMock,
  createRecordingMediaId: vi.fn(),
}));

vi.mock('../media-library/store', () => ({
  upsertMediaEntry: vi.fn(),
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecording: vi.fn(),
}));

function createDb() {
  return {
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        delete: deleteMocks.txDeleteMock,
        get: deleteMocks.txGetMock,
        getAll: deleteMocks.txGetAllMock,
        put: vi.fn(),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteMocks.initDBMock.mockResolvedValue(createDb());
  deleteMocks.createProjectAssetMediaIdMock.mockImplementation(
    (id: string) => `project-asset:${id}`
  );
  deleteMocks.txGetAllMock.mockResolvedValue([]);
});

it('deletes project-owned assets and mirrored media entries when removing a project', async () => {
  const { deleteVideoProject } = await import('./index');

  deleteMocks.txGetMock.mockResolvedValue(
    createVideoProjectEntry({
      assets: [
        {
          createdAt: 1,
          id: 'asset-1',
          metadata: {
            audioPeaks: null,
            duration: 4,
            hasAudio: false,
            height: 720,
            mimeType: 'video/mp4',
            size: 10,
            width: 1280,
          },
          name: 'Project asset',
          source: { kind: 'project-asset', projectAssetId: 'asset-1' },
          type: VideoProjectAssetType.VIDEO,
        },
      ],
    })
  );

  await deleteVideoProject('project-1');

  expect(deleteMocks.txDeleteMock).toHaveBeenNthCalledWith(1, 'project-1');
  expect(deleteMocks.txDeleteMock).toHaveBeenNthCalledWith(2, 'asset-1');
  expect(deleteMocks.txDeleteMock).toHaveBeenNthCalledWith(3, 'project-asset:asset-1');
});

it('preserves shared project-owned assets when another project still references them', async () => {
  const { deleteVideoProject } = await import('./index');
  const sharedAsset = {
    createdAt: 1,
    id: 'asset-shared',
    metadata: {
      audioPeaks: null,
      duration: 4,
      hasAudio: false,
      height: 720,
      mimeType: 'video/mp4',
      size: 10,
      width: 1280,
    },
    name: 'Shared project asset',
    source: { kind: 'project-asset' as const, projectAssetId: 'asset-shared' },
    type: VideoProjectAssetType.VIDEO,
  };

  deleteMocks.txGetMock.mockResolvedValue(createVideoProjectEntry({ assets: [sharedAsset] }));
  deleteMocks.txGetAllMock.mockResolvedValue([
    createVideoProjectEntry({ assets: [sharedAsset] }),
    createVideoProjectEntry({ assets: [sharedAsset], id: 'project-2' }, { id: 'project-2' }),
  ]);

  await deleteVideoProject('project-1');

  expect(deleteMocks.txDeleteMock).toHaveBeenCalledOnce();
  expect(deleteMocks.txDeleteMock).toHaveBeenCalledWith('project-1');
  expect(deleteMocks.txDeleteMock).not.toHaveBeenCalledWith('asset-shared');
  expect(deleteMocks.txDeleteMock).not.toHaveBeenCalledWith('project-asset:asset-shared');
});

it('deletes the project row when the project payload is already missing', async () => {
  const { deleteVideoProject } = await import('./index');
  deleteMocks.txGetMock.mockResolvedValue(undefined);

  await deleteVideoProject('missing-project');

  expect(deleteMocks.txDeleteMock).toHaveBeenCalledTimes(1);
  expect(deleteMocks.txDeleteMock).toHaveBeenCalledWith('missing-project');
});
