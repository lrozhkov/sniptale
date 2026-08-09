import { beforeEach, expect, it, vi } from 'vitest';
import { prepareScenarioV3ImageAsset } from './image-assets';

const imageAssetMocks = vi.hoisted(() => ({
  dataUrlToBlob: vi.fn(),
  measureImageBlob: vi.fn(),
}));

vi.mock('../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: imageAssetMocks.dataUrlToBlob,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: imageAssetMocks.measureImageBlob,
}));

beforeEach(() => {
  vi.clearAllMocks();
  imageAssetMocks.dataUrlToBlob.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  imageAssetMocks.measureImageBlob.mockResolvedValue({ height: 480, width: 640 });
});

it('prepares a v3 image layer asset with project dimensions for aggregate commit', async () => {
  const prepared = await prepareScenarioV3ImageAsset({
    dataUrl: 'data:image/png;base64,aW1n',
    projectId: 'project-1',
  });

  expect(imageAssetMocks.dataUrlToBlob).toHaveBeenCalledWith('data:image/png;base64,aW1n');
  expect(prepared.entry).toEqual(
    expect.objectContaining({
      blob: expect.any(Blob),
      galleryAssetId: null,
      height: 480,
      mimeType: 'image/png',
      projectId: 'project-1',
      size: 5,
      width: 640,
    })
  );
  expect(prepared.asset).toEqual(
    expect.objectContaining({
      galleryAssetId: null,
      height: 480,
      mimeType: 'image/png',
      projectId: 'project-1',
      size: 5,
      width: 640,
    })
  );
});

it('rejects unsafe image data urls before decode, measurement, or persistence', async () => {
  const unsafeDataUrls = [
    'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=',
    'data:text/html;base64,PGltZyBzcmM9eCBvbmVycm9yPWFsZXJ0KDEpPg==',
    'data:image/png,%3Csvg%3E',
    'data:image/png;base64,not valid!',
  ];

  for (const dataUrl of unsafeDataUrls) {
    await expect(
      prepareScenarioV3ImageAsset({
        dataUrl,
        projectId: 'project-1',
      })
    ).rejects.toThrow('Unsupported scenario image data URL');
  }

  expect(imageAssetMocks.dataUrlToBlob).not.toHaveBeenCalled();
  expect(imageAssetMocks.measureImageBlob).not.toHaveBeenCalled();
});
