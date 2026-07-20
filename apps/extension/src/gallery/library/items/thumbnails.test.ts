import { beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaItem,
  createScenarioItem,
  createVideoProjectItem,
} from '../actions/test-support/index';

const {
  createImageThumbnailBlobMock,
  createVideoThumbnailBlobMock,
  dataUrlToBlobMock,
  getMediaAssetBlobMock,
  getMediaThumbnailMock,
  listRecentScenarioStepsMock,
  saveMediaThumbnailMock,
} = vi.hoisted(() => ({
  createImageThumbnailBlobMock: vi.fn(),
  createVideoThumbnailBlobMock: vi.fn(),
  dataUrlToBlobMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  getMediaThumbnailMock: vi.fn(),
  listRecentScenarioStepsMock: vi.fn(),
  saveMediaThumbnailMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/media-library/index.library.ts')
    >()),
    getMediaAssetBlob: getMediaAssetBlobMock,
    getMediaThumbnail: getMediaThumbnailMock,
    saveMediaThumbnail: saveMediaThumbnailMock,
  })
);

vi.mock(
  '../../../composition/persistence/scenario/store/project-steps/project-step-queries',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/scenario/store/project-steps/project-step-queries')
    >()),
    listRecentScenarioSteps: listRecentScenarioStepsMock,
  })
);

vi.mock('../../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: createImageThumbnailBlobMock,
}));

vi.mock('../../../platform/media-utils/video-thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/video-thumbnails')>()),
  createVideoThumbnailBlob: createVideoThumbnailBlobMock,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: dataUrlToBlobMock,
}));

import { ensureGalleryItemThumbnail } from './thumbnails';

beforeEach(() => {
  vi.clearAllMocks();
});

it('returns existing thumbnails without rebuilding them', async () => {
  const existingThumbnail = {
    assetId: 'asset-1',
    blob: new Blob(['thumb'], { type: 'image/png' }),
    createdAt: 1,
    updatedAt: 2,
    width: 320,
    height: 180,
  };
  getMediaThumbnailMock.mockResolvedValue(existingThumbnail);

  await expect(ensureGalleryItemThumbnail(createMediaItem({ id: 'asset-1' }))).resolves.toEqual(
    existingThumbnail
  );
  expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  expect(saveMediaThumbnailMock).not.toHaveBeenCalled();
});

it('deduplicates media thumbnail generation and persists the generated entry', async () => {
  const videoBlob = new Blob(['video'], { type: 'video/webm' });
  const thumbnailBlob = new Blob(['thumb'], { type: 'image/png' });
  getMediaThumbnailMock.mockResolvedValue(undefined);
  getMediaAssetBlobMock.mockResolvedValue(videoBlob);
  createVideoThumbnailBlobMock.mockResolvedValue(thumbnailBlob);

  const item = createMediaItem({
    id: 'asset-1',
    kind: 'recording',
    mimeType: 'video/webm',
  });

  const [first, second] = await Promise.all([
    ensureGalleryItemThumbnail(item),
    ensureGalleryItemThumbnail(item),
  ]);

  expect(createVideoThumbnailBlobMock).toHaveBeenCalledTimes(1);
  expect(saveMediaThumbnailMock).toHaveBeenCalledTimes(1);
  expect(first).toEqual(second);
  expect(first).toMatchObject({
    assetId: 'asset-1',
    width: 320,
    height: 180,
  });
});

it('builds scenario thumbnails from recent step previews', async () => {
  const previewBlob = new Blob(['preview'], { type: 'image/png' });
  const thumbnailBlob = new Blob(['thumb'], { type: 'image/png' });
  getMediaThumbnailMock.mockResolvedValue(undefined);
  listRecentScenarioStepsMock.mockResolvedValue([
    {
      id: 'step-1',
      position: 0,
      previewDataUrl: 'data:image/png;base64,AAAA',
      title: 'Step 1',
    },
  ]);
  dataUrlToBlobMock.mockResolvedValue(previewBlob);
  createImageThumbnailBlobMock.mockResolvedValue(thumbnailBlob);

  const result = await ensureGalleryItemThumbnail(
    createScenarioItem({
      id: 'scenario:project-1',
      project: { createdAt: 1, id: 'project-1', name: 'Scenario', tags: [], updatedAt: 2 },
    })
  );

  expect(listRecentScenarioStepsMock).toHaveBeenCalledWith('project-1');
  expect(dataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,AAAA');
  expect(createImageThumbnailBlobMock).toHaveBeenCalledWith(previewBlob, 320, 180);
  expect(result).toMatchObject({ assetId: 'scenario:project-1' });
});

it('builds video project thumbnails from the project thumbnail source media id', async () => {
  const projectBlob = new Blob(['project-asset'], { type: 'video/webm' });
  const thumbnailBlob = new Blob(['thumb'], { type: 'image/png' });
  getMediaThumbnailMock.mockResolvedValue(undefined);
  getMediaAssetBlobMock.mockResolvedValue(projectBlob);
  createVideoThumbnailBlobMock.mockResolvedValue(thumbnailBlob);

  const result = await ensureGalleryItemThumbnail(
    createVideoProjectItem({
      id: 'video-project:project-1',
      thumbnailSourceMediaId: 'project-asset:asset-1',
    })
  );

  expect(getMediaAssetBlobMock).toHaveBeenCalledWith('project-asset:asset-1');
  expect(createVideoThumbnailBlobMock).toHaveBeenCalledWith(projectBlob, 320, 180);
  expect(result).toMatchObject({ assetId: 'video-project:project-1' });
});
