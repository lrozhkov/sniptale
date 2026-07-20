import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry, MediaThumbnailEntry } from './contracts';

const mocks = vi.hoisted(() => ({
  createImageThumbnailBlobMock: vi.fn(),
  getMock: vi.fn(),
  initDBMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  mediaPutMock: vi.fn(),
  thumbnailPutMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: vi.fn(),
  dataUrlToBlob: vi.fn(),
}));

vi.mock('../../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: mocks.createImageThumbnailBlobMock,
}));

vi.mock('../../../platform/media-utils/video-thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/video-thumbnails')>()),
  createVideoThumbnailBlob: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/media/image-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-load')>()),
  loadImageFromBlob: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: mocks.measureImageBlobMock,
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  initDB: mocks.initDBMock,
}));

function createExistingScreenshotEntry(
  overrides: Partial<MediaLibraryEntry> = {}
): MediaLibraryEntry {
  return {
    blob: new Blob(['existing'], { type: 'image/png' }),
    createdAt: 111,
    duration: null,
    filename: 'capture.png',
    height: 720,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'capture.png',
    size: 10,
    source: { kind: 'screenshot' },
    sourceFavicon: null,
    sourceTitle: 'Title',
    sourceUrl: 'https://example.com',
    tags: ['tag'],
    updatedAt: 222,
    width: 1280,
    ...overrides,
  };
}

function createTransaction() {
  return {
    done: Promise.resolve(),
    objectStore: vi.fn((storeName: string) => {
      if (storeName === 'media_library') {
        return { put: mocks.mediaPutMock };
      }

      return { put: mocks.thumbnailPutMock };
    }),
  };
}

function createDb() {
  return {
    get: mocks.getMock,
    transaction: mocks.transactionMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createImageThumbnailBlobMock.mockResolvedValue(new Blob(['thumb'], { type: 'image/webp' }));
  mocks.measureImageBlobMock.mockResolvedValue({ height: 720, width: 1280 });
  mocks.getMock.mockResolvedValue(undefined);
  mocks.mediaPutMock.mockResolvedValue(undefined);
  mocks.thumbnailPutMock.mockResolvedValue(undefined);
  mocks.transactionMock.mockImplementation(() => createTransaction());
  mocks.initDBMock.mockResolvedValue(createDb());
  vi.spyOn(Date, 'now').mockReturnValue(500);
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'generated-id'),
  });
});

describe('media-library-db.screenshots save entry', () => {
  it('creates a screenshot entry, generates ids, and stores a thumbnail', async () => {
    const { blob, result } = await saveBasicScreenshotEntry();

    expect(mocks.measureImageBlobMock).toHaveBeenCalledWith(blob);
    expect(mocks.createImageThumbnailBlobMock).toHaveBeenCalledWith(blob);
    expectBasicScreenshotEntry(result, blob);
    expect(mocks.mediaPutMock).toHaveBeenCalledWith(result);
    expectBasicScreenshotThumbnail();
  });

  it('sanitizes sensitive source provenance before writing the screenshot entry', async () => {
    const { saveScreenshotMediaAsset } = await import('./index.screenshots.ts');
    const blob = new Blob(['image'], { type: 'image/jpeg' });

    const result = await saveScreenshotMediaAsset({
      blob,
      filename: 'capture.jpg',
      sourceFavicon: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
      sourceTitle: 'Example',
      sourceUrl: 'https://user:pass@example.com/reset/password?token=secret#access_token=abc',
    });

    expect(result.sourceUrl).toBe('https://example.com/');
    expect(result.sourceFavicon).toBe('https://example.com/favicon.ico');
    expect(mocks.mediaPutMock).toHaveBeenCalledWith(result);
  });
});

async function saveBasicScreenshotEntry() {
  const { saveScreenshotMediaAsset } = await import('./index.screenshots.ts');
  const blob = new Blob(['image'], { type: 'image/jpeg' });
  const result = await saveScreenshotMediaAsset({
    blob,
    filename: 'capture.jpg',
    sourceFavicon: 'https://example.com/favicon.ico',
    sourceTitle: 'Example',
    sourceUrl: 'https://example.com',
    tags: ['one'],
  });

  return { blob, result };
}

function expectBasicScreenshotEntry(result: MediaLibraryEntry, blob: Blob): void {
  expect(result).toEqual(
    expect.objectContaining({
      blob,
      createdAt: 500,
      filename: 'capture.jpg',
      id: 'generated-id',
      kind: 'screenshot',
      mimeType: 'image/jpeg',
      originalFilename: 'capture.jpg',
      source: { kind: 'screenshot' },
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceTitle: 'Example',
      sourceUrl: 'https://example.com/',
      tags: ['one'],
      updatedAt: 500,
    })
  );
}

function expectBasicScreenshotThumbnail(): void {
  expect(mocks.thumbnailPutMock).toHaveBeenCalledWith(
    expect.objectContaining<Partial<MediaThumbnailEntry>>({
      assetId: 'generated-id',
      createdAt: 500,
      height: 180,
      updatedAt: 500,
      width: 320,
    })
  );
}

describe('media-library-db.screenshots save metadata', () => {
  it('respects provided ids and createdAt and falls back to png mime type', async () => {
    const { saveScreenshotMediaAsset } = await import('./index.screenshots.ts');
    const blob = new Blob(['image']);

    const result = await saveScreenshotMediaAsset({
      blob,
      createdAt: 123,
      filename: 'capture',
      id: 'explicit-id',
    });

    expect(result.id).toBe('explicit-id');
    expect(result.createdAt).toBe(123);
    expect(result.mimeType).toBe('image/png');
    expect(mocks.thumbnailPutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'explicit-id',
        createdAt: 123,
        updatedAt: 500,
      })
    );
  });
});

describe('media-library-db.screenshots update flow', () => {
  it('updates existing screenshot entries and preserves immutable metadata', async () => {
    const { updateScreenshotMediaAsset } = await import('./index.screenshots.ts');
    const existing = createExistingScreenshotEntry();
    const blob = new Blob(['updated'], { type: 'image/webp' });
    mocks.getMock.mockResolvedValue(existing);

    const result = await updateScreenshotMediaAsset('asset-1', blob, 'renamed.webp');

    expect(mocks.getMock).toHaveBeenCalledWith('media_library', 'asset-1');
    expect(result).toEqual(
      expect.objectContaining({
        blob,
        createdAt: 111,
        filename: 'renamed.webp',
        id: 'asset-1',
        mimeType: 'image/webp',
        updatedAt: 500,
      })
    );
    expect(mocks.mediaPutMock).toHaveBeenCalledWith(result);
    expect(mocks.thumbnailPutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-1',
        createdAt: 111,
        updatedAt: 500,
      })
    );
  });

  it('throws when the asset is missing or not a screenshot', async () => {
    const { updateScreenshotMediaAsset } = await import('./index.screenshots.ts');

    mocks.getMock.mockResolvedValueOnce(undefined);
    await expect(updateScreenshotMediaAsset('missing', new Blob(['missing']))).rejects.toThrow(
      'Скриншотный asset missing не найден.'
    );

    mocks.getMock.mockResolvedValueOnce(
      createExistingScreenshotEntry({
        source: { kind: 'recording', recordingId: 'rec-1' },
      })
    );
    await expect(updateScreenshotMediaAsset('asset-1', new Blob(['wrong-kind']))).rejects.toThrow(
      'Скриншотный asset asset-1 не найден.'
    );
  });
});
