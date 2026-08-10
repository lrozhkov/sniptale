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
  getAggregatePresentationMock,
  getMediaAssetBlobMock,
  getMediaThumbnailMock,
  listRecentScenarioStepsMock,
  saveMediaThumbnailMock,
} = vi.hoisted(() => ({
  createImageThumbnailBlobMock: vi.fn(),
  createVideoThumbnailBlobMock: vi.fn(),
  dataUrlToBlobMock: vi.fn(),
  getAggregatePresentationMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  getMediaThumbnailMock: vi.fn(),
  listRecentScenarioStepsMock: vi.fn(),
  saveMediaThumbnailMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/aggregate-presentations', () => ({
  getAggregatePresentation: getAggregatePresentationMock,
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
  getAggregatePresentationMock.mockResolvedValue(undefined);
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

  await expect(
    ensureGalleryItemThumbnail(
      createMediaItem({ id: 'asset-1', kind: 'recording', mimeType: 'video/webm' })
    )
  ).resolves.toEqual(existingThumbnail);
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

it('reads scenario thumbnails only from aggregate presentations', async () => {
  const thumbnailBlob = new Blob(['thumb'], { type: 'image/png' });
  getAggregatePresentationMock.mockResolvedValueOnce({
    presentationRevision: 3,
    thumbnailBlob,
    updatedAt: 4,
  });

  const result = await ensureGalleryItemThumbnail(
    createScenarioItem({
      id: 'scenario:project-1',
      project: { createdAt: 1, id: 'project-1', name: 'Scenario', tags: [], updatedAt: 2 },
    })
  );

  expect(getAggregatePresentationMock).toHaveBeenCalledWith({
    id: 'project-1',
    kind: 'scenario',
  });
  expect(listRecentScenarioStepsMock).not.toHaveBeenCalled();
  expect(saveMediaThumbnailMock).not.toHaveBeenCalled();
  expect(result).toMatchObject({ assetId: 'scenario:project-1' });
});

it('reads video project thumbnails only from aggregate presentations', async () => {
  const thumbnailBlob = new Blob(['thumb'], { type: 'image/png' });
  getAggregatePresentationMock.mockResolvedValueOnce({
    presentationRevision: 2,
    thumbnailBlob,
    updatedAt: 4,
  });

  const result = await ensureGalleryItemThumbnail(
    createVideoProjectItem({
      id: 'video-project:project-1',
      thumbnailSourceMediaId: 'project-asset:asset-1',
    })
  );

  expect(getAggregatePresentationMock).toHaveBeenCalledWith({
    id: 'video-project-1',
    kind: 'video-project',
  });
  expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  expect(saveMediaThumbnailMock).not.toHaveBeenCalled();
  expect(result).toMatchObject({ assetId: 'video-project:project-1' });
});
