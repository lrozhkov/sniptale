import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import type { LibraryThumbnailItem } from './types';

const thumbnailMocks = vi.hoisted(() => ({
  createImageThumbnailBlobMock: vi.fn(),
  createVideoThumbnailBlobMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  getMediaThumbnailMock: vi.fn(),
  saveMediaThumbnailMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../composition/persistence/media-library/index.library.ts')
      >();
    return {
      ...actual,
      getMediaAssetBlob: thumbnailMocks.getMediaAssetBlobMock,
      getMediaThumbnail: thumbnailMocks.getMediaThumbnailMock,
      saveMediaThumbnail: thumbnailMocks.saveMediaThumbnailMock,
    };
  }
);

vi.mock('../../../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: thumbnailMocks.createImageThumbnailBlobMock,
}));

vi.mock('../../../../platform/media-utils/video-thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/media-utils/video-thumbnails')>()),
  createVideoThumbnailBlob: thumbnailMocks.createVideoThumbnailBlobMock,
}));

function createItem(overrides: Partial<LibraryThumbnailItem> = {}): LibraryThumbnailItem {
  return {
    createdAt: 100,
    id: 'recording-1',
    mimeType: 'video/webm',
    sourceMediaId: 'recording:recording-1',
    thumbnailId: 'recording:recording-1',
    ...overrides,
  };
}

function createThumbnailEntry(overrides: Partial<MediaThumbnailEntry> = {}): MediaThumbnailEntry {
  return {
    assetId: 'recording:recording-1',
    blob: new Blob(['cached'], { type: 'image/webp' }),
    createdAt: 100,
    height: 180,
    updatedAt: 100,
    width: 320,
    ...overrides,
  };
}

async function importEnsureModule() {
  vi.resetModules();
  return import('./ensure');
}

beforeEach(() => {
  vi.clearAllMocks();
  thumbnailMocks.getMediaThumbnailMock.mockResolvedValue(undefined);
  thumbnailMocks.getMediaAssetBlobMock.mockResolvedValue(
    new Blob(['video'], { type: 'video/webm' })
  );
  thumbnailMocks.createVideoThumbnailBlobMock.mockResolvedValue(
    new Blob(['thumb'], { type: 'image/webp' })
  );
  thumbnailMocks.createImageThumbnailBlobMock.mockResolvedValue(
    new Blob(['thumb'], { type: 'image/webp' })
  );
  thumbnailMocks.saveMediaThumbnailMock.mockResolvedValue(undefined);
});

it('returns cached thumbnails without reading source blobs', async () => {
  const cached = createThumbnailEntry();
  thumbnailMocks.getMediaThumbnailMock.mockResolvedValueOnce(cached);
  const { ensureLibraryThumbnail } = await importEnsureModule();

  await expect(ensureLibraryThumbnail(createItem())).resolves.toBe(cached);

  expect(thumbnailMocks.getMediaAssetBlobMock).not.toHaveBeenCalled();
  expect(thumbnailMocks.saveMediaThumbnailMock).not.toHaveBeenCalled();
}, 15000);

it('generates and stores video thumbnails for recordings', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);
  const { ensureLibraryThumbnail } = await importEnsureModule();

  await expect(ensureLibraryThumbnail(createItem())).resolves.toEqual(
    expect.objectContaining({ assetId: 'recording:recording-1', updatedAt: 500 })
  );

  expect(thumbnailMocks.getMediaAssetBlobMock).toHaveBeenCalledWith('recording:recording-1');
  expect(thumbnailMocks.createVideoThumbnailBlobMock).toHaveBeenCalledWith(
    expect.any(Blob),
    320,
    180
  );
  expect(thumbnailMocks.saveMediaThumbnailMock).toHaveBeenCalledWith(
    expect.objectContaining({ assetId: 'recording:recording-1', width: 320, height: 180 })
  );
});

it('stores project thumbnails under the project thumbnail id from a visual source asset', async () => {
  const imageBlob = new Blob(['image'], { type: 'image/png' });
  thumbnailMocks.getMediaAssetBlobMock.mockResolvedValueOnce(imageBlob);
  const { ensureLibraryThumbnail } = await importEnsureModule();

  await ensureLibraryThumbnail(
    createItem({
      id: 'project-1',
      mimeType: null,
      sourceMediaId: 'project-asset:asset-1',
      thumbnailId: 'video-project:project-1',
    })
  );

  expect(thumbnailMocks.createImageThumbnailBlobMock).toHaveBeenCalledWith(imageBlob, 320, 180);
  expect(thumbnailMocks.saveMediaThumbnailMock).toHaveBeenCalledWith(
    expect.objectContaining({ assetId: 'video-project:project-1' })
  );
});

it('fails soft when thumbnail generation cannot read or render a source', async () => {
  thumbnailMocks.getMediaAssetBlobMock.mockRejectedValueOnce(new Error('decode failed'));
  const { ensureLibraryThumbnail } = await importEnsureModule();

  await expect(ensureLibraryThumbnail(createItem())).resolves.toBeUndefined();

  expect(thumbnailMocks.saveMediaThumbnailMock).not.toHaveBeenCalled();
});

it('deduplicates pending loads inside one factory-created service and isolates service instances', async () => {
  const { createLibraryThumbnailService } = await importEnsureModule();
  const thumbnailBlob = new Blob(['thumb'], { type: 'image/webp' });
  const deps = {
    createVideoThumbnailBlob: vi.fn().mockResolvedValue(thumbnailBlob),
    getMediaAssetBlob: vi.fn().mockResolvedValue(new Blob(['video'], { type: 'video/webm' })),
    getMediaThumbnail: vi.fn().mockResolvedValue(undefined),
    now: () => 700,
    saveMediaThumbnail: vi.fn().mockResolvedValue(undefined),
  };
  const firstService = createLibraryThumbnailService(deps);
  const secondService = createLibraryThumbnailService(deps);

  const firstPending = firstService.ensureThumbnail(createItem());
  const secondPending = firstService.ensureThumbnail(createItem());

  await expect(Promise.all([firstPending, secondPending])).resolves.toEqual([
    expect.objectContaining({ updatedAt: 700 }),
    expect.objectContaining({ updatedAt: 700 }),
  ]);
  expect(deps.getMediaAssetBlob).toHaveBeenCalledTimes(1);

  await secondService.ensureThumbnail(createItem());

  expect(deps.getMediaAssetBlob).toHaveBeenCalledTimes(2);
});

it('cleans pending factory-owned state after failed thumbnail generation', async () => {
  const { createLibraryThumbnailService } = await importEnsureModule();
  const deps = {
    createVideoThumbnailBlob: vi
      .fn()
      .mockResolvedValue(new Blob(['thumb'], { type: 'image/webp' })),
    getMediaAssetBlob: vi
      .fn()
      .mockRejectedValueOnce(new Error('decode failed'))
      .mockResolvedValueOnce(new Blob(['video'], { type: 'video/webm' })),
    getMediaThumbnail: vi.fn().mockResolvedValue(undefined),
    now: () => 800,
    saveMediaThumbnail: vi.fn().mockResolvedValue(undefined),
  };
  const service = createLibraryThumbnailService(deps);

  await expect(service.ensureThumbnail(createItem())).resolves.toBeUndefined();
  await expect(service.ensureThumbnail(createItem())).resolves.toEqual(
    expect.objectContaining({ updatedAt: 800 })
  );

  expect(deps.getMediaAssetBlob).toHaveBeenCalledTimes(2);
  expect(deps.saveMediaThumbnail).toHaveBeenCalledTimes(1);
});
