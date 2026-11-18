import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readOriginal: vi.fn(),
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,b3JpZ2luYWw='),
}));
vi.mock('../image-workspaces/read', () => ({
  readImageOriginalSource: mocks.readOriginal,
}));
vi.mock('../../../platform/media-utils/data-url', () => ({
  blobToDataUrl: mocks.blobToDataUrl,
}));

import { readImageAggregateOriginalDocument } from './original-document';

beforeEach(() => vi.clearAllMocks());

it('builds a clean document from retained source bytes after edits', async () => {
  const blob = new Blob(['original'], { type: 'image/png' });
  mocks.readOriginal.mockResolvedValue({
    asset: {
      id: 'image-project',
      kind: 'image',
      originalFilename: 'capture.png',
      width: 100,
      height: 80,
    },
    blob,
  });

  const document = await readImageAggregateOriginalDocument('image-project');

  expect(mocks.readOriginal).toHaveBeenCalledWith('image-project');
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
    frame: {
      backgroundMode: 'color',
      backgroundColor: 'transparent',
      backgroundImageData: null,
      layoutMode: 'fit-image',
    },
  });
  expect(JSON.parse(document!.canvasJson)).toMatchObject({ objects: [] });
});

it('returns no original when the asset bytes are unavailable', async () => {
  mocks.readOriginal.mockResolvedValue({
    asset: { id: 'image-1', kind: 'image' },
    blob: undefined,
  });
  await expect(readImageAggregateOriginalDocument('image-1')).resolves.toBeNull();
});
