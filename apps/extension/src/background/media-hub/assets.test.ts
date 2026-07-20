import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureHeadroomMock: vi.fn(),
  dataUrlToBlobMock: vi.fn(),
  saveAssetMock: vi.fn(),
  translateMock: vi.fn(),
  updateAssetMock: vi.fn(),
  tabsGetMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: mocks.tabsGetMock,
  },
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

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: mocks.translateMock,
}));

vi.mock('../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n/format-bytes')>()),
  formatBytes: (value: number) => `${value}B`,
}));

vi.mock('../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/storage-capacity')>()),
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroomMock,
}));

import { saveScreenshotToMediaHubFromDataUrl, updateGalleryImageAssetFromDataUrl } from './assets';

function setupScreenshotBridgeTest() {
  vi.clearAllMocks();
  mocks.ensureHeadroomMock.mockResolvedValue(undefined);
  mocks.translateMock.mockImplementation((key: string) => {
    const translations: Record<string, string> = {
      'shared.storage.lowSpaceMiddle': 'available.',
      'shared.storage.lowSpacePrefix': 'Not enough storage:',
      'shared.storage.lowSpaceSuffix': 'Free up space and try again.',
    };

    return translations[key] ?? key;
  });
}

async function verifiesScreenshotSaveWithResolvedTabMetadata() {
  mocks.dataUrlToBlobMock.mockResolvedValue('blob');
  mocks.tabsGetMock.mockResolvedValue({
    favIconUrl: 'https://example.com/favicon.ico',
    title: 'Example',
    url: 'https://example.com',
  });
  mocks.saveAssetMock.mockResolvedValue({ id: 'asset-1' });

  await expect(
    saveScreenshotToMediaHubFromDataUrl('data:image/png;base64,abc', 'shot.png', 7)
  ).resolves.toBe('asset-1');

  expect(mocks.ensureHeadroomMock).toHaveBeenCalledOnce();
  expect(mocks.saveAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      blob: 'blob',
      filename: 'shot.png',
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceTitle: 'Example',
      sourceUrl: 'https://example.com',
    })
  );
}

async function verifiesFallbackMetadataAndGalleryAssetUpdate() {
  mocks.dataUrlToBlobMock.mockResolvedValue('blob');
  mocks.tabsGetMock.mockRejectedValue(new Error('missing'));
  mocks.saveAssetMock.mockResolvedValue({ id: 'asset-2' });
  mocks.updateAssetMock.mockResolvedValue({ id: 'asset-3' });

  await expect(saveScreenshotToMediaHubFromDataUrl('data', 'shot.png', 9)).resolves.toBe('asset-2');
  await expect(updateGalleryImageAssetFromDataUrl('asset-3', 'data', 'next.png')).resolves.toBe(
    'asset-3'
  );

  expect(mocks.saveAssetMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ sourceFavicon: null, sourceTitle: null, sourceUrl: null })
  );
  expect(mocks.updateAssetMock).toHaveBeenCalledWith('asset-3', 'blob', 'next.png');
}

async function verifiesLocalizedLowHeadroomCopy() {
  mocks.ensureHeadroomMock.mockRejectedValue({
    isStorageQuotaHeadroomError: true,
    payload: {
      estimate: {
        isPersistent: false,
        pressure: 'critical',
        quota: 1000,
        remaining: 20,
        usage: 980,
        usageRatio: 0.98,
      },
      kind: 'storage-headroom-low',
      requiredFreeBytes: 50,
    },
  });

  await expect(saveScreenshotToMediaHubFromDataUrl('data', 'shot.png')).rejects.toThrow(
    'Not enough storage: 20B available. Free up space and try again.'
  );
  expect(mocks.saveAssetMock).not.toHaveBeenCalled();
}

describe('media hub bridge', () => {
  beforeEach(setupScreenshotBridgeTest);

  it('saves screenshots with resolved tab metadata', verifiesScreenshotSaveWithResolvedTabMetadata);
  it(
    'falls back to null source metadata and updates gallery assets',
    verifiesFallbackMetadataAndGalleryAssetUpdate
  );
  it('surfaces low headroom as localized media storage copy', verifiesLocalizedLowHeadroomCopy);
});
