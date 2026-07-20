import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createScenarioAssetIdMock, dataUrlToBlobMock, measureImageBlobMock } = vi.hoisted(() => ({
  createScenarioAssetIdMock: vi.fn(),
  dataUrlToBlobMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
}));

vi.mock('../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: dataUrlToBlobMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

vi.mock('../project-records/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project-records/helpers')>()),
  createScenarioAssetId: createScenarioAssetIdMock,
}));

import { createScenarioAssetEntry, createScenarioAssetEntryFromBlob } from './asset-entry';

beforeEach(() => {
  vi.clearAllMocks();
  createScenarioAssetIdMock.mockReturnValue('asset-1');
  dataUrlToBlobMock.mockResolvedValue(new Blob(['pixel']));
  measureImageBlobMock.mockResolvedValue({ width: 1440, height: 900 });
});

async function verifyAssetEntryCreation() {
  const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(123);

  try {
    const result = await createScenarioAssetEntry({
      dataUrl: 'data:image/png;base64,asset',
      galleryAssetId: null,
      projectId: 'project-1',
    });

    expect(dataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,asset');
    expect(measureImageBlobMock).toHaveBeenCalledWith(expect.any(Blob));
    expect(result).toEqual({
      now: 123,
      assetEntry: expect.objectContaining({
        id: 'asset-1',
        projectId: 'project-1',
        galleryAssetId: null,
        mimeType: 'image/png',
        width: 1440,
        height: 900,
        createdAt: 123,
      }),
    });
  } finally {
    dateNowSpy.mockRestore();
  }
}

describe('capture-step asset entry', () => {
  it('creates immutable scenario asset entries from capture data', verifyAssetEntryCreation);

  it('creates immutable scenario asset entries from a provided blob', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(456);
    const blob = new Blob(['pixel'], { type: 'image/webp' });

    try {
      const result = await createScenarioAssetEntryFromBlob({
        blob,
        galleryAssetId: 'gallery-1',
        projectId: 'project-1',
      });

      expect(measureImageBlobMock).toHaveBeenCalledWith(blob);
      expect(result).toEqual({
        now: 456,
        assetEntry: expect.objectContaining({
          id: 'asset-1',
          projectId: 'project-1',
          galleryAssetId: 'gallery-1',
          mimeType: 'image/webp',
          width: 1440,
          height: 900,
          createdAt: 456,
        }),
      });
    } finally {
      dateNowSpy.mockRestore();
    }
  });
});
