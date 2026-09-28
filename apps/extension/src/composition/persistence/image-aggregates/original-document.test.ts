import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMedia: vi.fn(),
  getBlob: vi.fn(),
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,b3JpZ2luYWw='),
}));
vi.mock('../media-library/index.library', () => ({
  getMediaLibraryEntry: mocks.getMedia,
  getMediaAssetBlob: mocks.getBlob,
}));
vi.mock('../../../platform/media-utils/data-url', () => ({
  blobToDataUrl: mocks.blobToDataUrl,
}));

import { readImageAggregateOriginalDocument } from './original-document';

beforeEach(() => vi.clearAllMocks());

it('builds a clean document from retained source bytes after edits', async () => {
  const blob = new Blob(['original'], { type: 'image/png' });
  mocks.getMedia.mockResolvedValue({
    id: 'image-1',
    kind: 'image',
    originalFilename: 'capture.png',
    width: 100,
    height: 80,
  });
  mocks.getBlob.mockResolvedValue(blob);

  const document = await readImageAggregateOriginalDocument('image-1');

  expect(mocks.getBlob).toHaveBeenCalledWith('image-1');
  expect(mocks.blobToDataUrl).toHaveBeenCalledWith(blob);
  expect(document).toMatchObject({
    sourceImageData: 'data:image/png;base64,b3JpZ2luYWw=',
    sourceName: 'capture.png',
    sourceWidth: 100,
    sourceHeight: 80,
    canvasWidth: 100,
    canvasHeight: 80,
    sourceLeft: 0,
    sourceTop: 0,
  });
  expect(JSON.parse(document!.canvasJson)).toMatchObject({ objects: [] });
});

it('returns no original when the asset bytes are unavailable', async () => {
  mocks.getMedia.mockResolvedValue({ id: 'image-1', kind: 'image' });
  mocks.getBlob.mockResolvedValue(undefined);
  await expect(readImageAggregateOriginalDocument('image-1')).resolves.toBeNull();
});
