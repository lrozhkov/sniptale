import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  browserGetMock: vi.fn(),
  dataUrlToBlobMock: vi.fn(async () => new Blob(['image'])),
  ensureHeadroomMock: vi.fn(async () => undefined),
  saveAssetMock: vi.fn(async () => ({ id: 'saved-id' })),
  updateAssetMock: vi.fn(async () => ({ id: 'updated-id' })),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: mocks.browserGetMock },
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  saveScreenshotMediaAssetSafely: mocks.saveAssetMock,
  updateScreenshotMediaAssetSafely: mocks.updateAssetMock,
}));

vi.mock('../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/data-url')>()),
  dataUrlToBlob: mocks.dataUrlToBlobMock,
}));

vi.mock('../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/storage-capacity')>()),
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroomMock,
}));

import { saveScreenshotToMediaHubFromDataUrl, updateGalleryImageAssetFromDataUrl } from './assets';

beforeEach(() => {
  vi.clearAllMocks();
});

it('saves screenshots without tab metadata when no tab id is provided', async () => {
  await expect(
    saveScreenshotToMediaHubFromDataUrl('data:image/png;base64,abc', 'capture.png')
  ).resolves.toBe('saved-id');

  expect(mocks.browserGetMock).not.toHaveBeenCalled();
  expect(mocks.ensureHeadroomMock).toHaveBeenCalledOnce();
  expect(mocks.saveAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      filename: 'capture.png',
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
    })
  );
});

it('falls back to null tab metadata when tab lookup fails', async () => {
  mocks.browserGetMock.mockRejectedValueOnce(new Error('missing tab'));

  await saveScreenshotToMediaHubFromDataUrl('data:image/png;base64,abc', 'capture.png', 9);

  expect(mocks.saveAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({ sourceFavicon: null, sourceTitle: null, sourceUrl: null })
  );
});

it('stores tab metadata when the tab lookup succeeds', async () => {
  mocks.browserGetMock.mockResolvedValueOnce({
    favIconUrl: 'https://example.com/favicon.ico',
    title: 'Example page',
    url: 'https://example.com',
  });

  await expect(
    saveScreenshotToMediaHubFromDataUrl('data:image/png;base64,abc', 'capture.png', 9)
  ).resolves.toBe('saved-id');

  expect(mocks.saveAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceTitle: 'Example page',
      sourceUrl: 'https://example.com',
    })
  );
});

it('normalizes missing tab metadata fields to null', async () => {
  mocks.browserGetMock.mockResolvedValueOnce({});

  await saveScreenshotToMediaHubFromDataUrl('data:image/png;base64,abc', 'capture.png', 9);

  expect(mocks.saveAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
    })
  );
});

it('updates gallery image assets from data urls', async () => {
  await expect(
    updateGalleryImageAssetFromDataUrl('asset-1', 'data:image/png;base64,abc', 'capture.png')
  ).resolves.toBe('updated-id');

  expect(mocks.updateAssetMock).toHaveBeenCalledWith('asset-1', expect.any(Blob), 'capture.png');
});
