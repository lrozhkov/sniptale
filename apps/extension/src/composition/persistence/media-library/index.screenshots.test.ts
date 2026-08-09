import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from './contracts';

const mocks = vi.hoisted(() => ({
  createImageThumbnailBlobMock: vi.fn(),
  initDBMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  mediaGetMock: vi.fn(),
  mediaPutMock: vi.fn(),
  presentationGetMock: vi.fn(),
  thumbnailPutMock: vi.fn(),
  transactionMock: vi.fn(),
  workspaceGetMock: vi.fn(),
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
  AGGREGATE_PRESENTATIONS_STORE: 'aggregate_presentations',
  IMAGE_WORKSPACES_STORE: 'image_workspaces',
  MEDIA_LIBRARY_STORE: 'media_library',
  initDB: mocks.initDBMock,
}));

function createTransaction() {
  return {
    done: Promise.resolve(),
    objectStore: vi.fn((storeName: string) => {
      if (storeName === 'media_library') {
        return { get: mocks.mediaGetMock, put: mocks.mediaPutMock };
      }
      if (storeName === 'image_workspaces') {
        return { get: mocks.workspaceGetMock };
      }
      return { get: mocks.presentationGetMock, put: mocks.thumbnailPutMock };
    }),
  };
}

function createDb() {
  return {
    transaction: mocks.transactionMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createImageThumbnailBlobMock.mockResolvedValue(new Blob(['thumb'], { type: 'image/webp' }));
  mocks.measureImageBlobMock.mockResolvedValue({ height: 720, width: 1280 });
  mocks.mediaGetMock.mockResolvedValue(undefined);
  mocks.mediaPutMock.mockResolvedValue(undefined);
  mocks.thumbnailPutMock.mockResolvedValue(undefined);
  mocks.presentationGetMock.mockResolvedValue(undefined);
  mocks.workspaceGetMock.mockResolvedValue(undefined);
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
    expect.objectContaining({
      aggregateId: 'generated-id',
      aggregateKind: 'image',
      presentationRevision: 0,
      updatedAt: 500,
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
        aggregateId: 'explicit-id',
        aggregateKind: 'image',
        presentationRevision: 0,
        updatedAt: 500,
      })
    );
  });
});

describe('media-library-db.screenshots aggregate identity collisions', () => {
  it.each([
    ['media root', 'mediaGetMock', { id: 'occupied-id' }],
    ['image workspace', 'workspaceGetMock', { aggregateId: 'occupied-id' }],
    ['aggregate presentation', 'presentationGetMock', { aggregateId: 'occupied-id' }],
    ['malformed persisted row', 'mediaGetMock', null],
  ] as const)(
    'rejects an occupied target in the %s before any put',
    async (_label, mockName, row) => {
      mocks[mockName].mockResolvedValueOnce(row);
      const { saveScreenshotMediaAsset } = await import('./index.screenshots.ts');

      await expect(
        saveScreenshotMediaAsset({
          blob: new Blob(['image'], { type: 'image/png' }),
          filename: 'capture.png',
          id: 'occupied-id',
        })
      ).rejects.toMatchObject({
        aggregateId: 'occupied-id',
        name: 'ImageAggregateCollisionError',
      });

      expect(mocks.mediaPutMock).not.toHaveBeenCalled();
      expect(mocks.thumbnailPutMock).not.toHaveBeenCalled();
    }
  );
});
