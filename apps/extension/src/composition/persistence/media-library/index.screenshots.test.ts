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

vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
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
      imageContentState: 'original',
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
  it('stores a user-imported image with image semantics', async () => {
    const { saveScreenshotMediaAsset } = await import('./index.screenshots.ts');
    const result = await saveScreenshotMediaAsset({
      blob: new Blob(['image'], { type: 'image/png' }),
      filename: 'photo.png',
      kind: 'image',
    });

    expect(result.kind).toBe('image');
  });

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

it('recreates an enrolled image above its retained revision fence', async () => {
  const { createReviewWorkspaceStoreFixture } =
    await import('../review-workspaces/store.test-support');
  const { captureRootKey } = await import('../sync-capture/contracts');
  const { parseSyncCaptureRecord } = await import('../sync-capture/guards');
  const { saveScreenshotMediaAsset } = await import('./index.screenshots');
  let refuseCapture = false;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => refuseCapture && name === 'sync_capture'
  );
  const mediaId = 'recreated-image';
  const oldCopy = {
    version: 1,
    kind: 'copy',
    id: JSON.stringify(['copy', 'inline-image', mediaId]),
    revision: 2,
    operationId: 'old-unload',
    phase: 'unloaded',
    target: {
      kind: 'inline-image',
      mediaId,
      createdAt: 1,
      workspaceRevision: 0,
      rootGeneration: 1,
      nativeDigest: 'a'.repeat(64),
      size: 6,
      mimeType: 'image/png',
      blobType: 'image/png',
    },
    remote: {
      binding: {
        provider: 'webdav',
        rootUrl: 'https://dav.test/root/',
        accountId: 'alice',
        spaceId: 'space',
        connectionGeneration: 1,
        profileCreatedAt: 1,
      },
      key: 'Files/original.png',
      sha256: 'b'.repeat(64),
    },
    lastUsedAt: 1,
  };
  fixture.rows.get('asset_residency')!.set(oldCopy.id, oldCopy);
  const captures = fixture.rows.get('sync_capture')!;
  const rootKey = captureRootKey('space', 'media', 'recreated-image');
  const stateKey = JSON.stringify(['root-state', rootKey]);
  captures.set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 1,
  });
  captures.set(stateKey, {
    version: 1,
    kind: 'root-state',
    key: stateKey,
    createdAt: 1,
    spaceId: 'space',
    rootKind: 'media',
    rootId: 'recreated-image',
    rootKey,
    generation: 2,
    basis: ['deleted-image'],
    deleted: true,
    nativeRevision: 7,
  });
  mocks.initDBMock.mockResolvedValue({
    transaction(stores: string[], mode: string) {
      const tx = fixture.database.transaction(stores, mode);
      return {
        abort: () => tx.abort(),
        get done() {
          return tx.done;
        },
        objectStore(name: string) {
          const store = tx.objectStore(name);
          if (name !== 'aggregate_presentations') return store;
          return {
            ...store,
            get: (key: IDBValidKey) =>
              store.get(
                Array.isArray(key) && key[0] === 'image' && typeof key[1] === 'string'
                  ? key[1]
                  : key
              ),
          };
        },
      };
    },
  });
  const before = structuredClone(fixture.rows);
  refuseCapture = true;
  await expect(
    saveScreenshotMediaAsset({
      id: 'recreated-image',
      blob: new Blob(['new-image'], { type: 'image/png' }),
      filename: 'new.png',
    })
  ).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(fixture.rows).toEqual(before);
  refuseCapture = false;
  const result = await saveScreenshotMediaAsset({
    id: 'recreated-image',
    blob: new Blob(['new-image'], { type: 'image/png' }),
    filename: 'new.png',
  });
  expect(result.workspaceRevision).toBe(8);
  expect(fixture.rows.get('asset_residency')!.has(oldCopy.id)).toBe(false);
  expect(fixture.rows.get('sync_capture')!.get(stateKey)).toMatchObject({
    nativeRevision: 8,
    generation: 3,
    basis: ['generated-id'],
  });
  const captured = [...fixture.rows.get('sync_capture')!.values()]
    .map(parseSyncCaptureRecord)
    .find((row) => row?.kind === 'sync-operation');
  expect(captured).toMatchObject({
    phase: 'native',
    change: { kind: 'image', rows: { presentation: { presentationRevision: 8 } } },
  });
});

it('commits a temporary screenshot above the sync metadata limit and refuses its promotion atomically', async () => {
  const { createReviewWorkspaceStoreFixture } =
    await import('../review-workspaces/store.test-support');
  const { MAX_CAPTURE_METADATA_BYTES } = await import('../sync-capture/contracts');
  const { saveScreenshotMediaAsset } = await import('./index.screenshots');
  const { promoteImageAggregate } = await import('../image-aggregates/mutations');
  const fixture = createReviewWorkspaceStoreFixture(() => false);
  fixture.rows.get('sync_capture')!.set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 1,
  });
  mocks.initDBMock.mockResolvedValue({
    transaction(stores: string[], mode: string) {
      const tx = fixture.database.transaction(stores, mode);
      return {
        abort: () => tx.abort(),
        get done() {
          return tx.done;
        },
        objectStore(name: string) {
          const store = tx.objectStore(name);
          return name !== 'aggregate_presentations'
            ? store
            : {
                ...store,
                get: (key: IDBValidKey) =>
                  store.get(
                    Array.isArray(key) && key[0] === 'image' && typeof key[1] === 'string'
                      ? key[1]
                      : key
                  ),
              };
        },
      };
    },
  });
  const sourceTitle = 'x'.repeat(MAX_CAPTURE_METADATA_BYTES + 1);
  const saved = await saveScreenshotMediaAsset({
    id: 'temporary-large-title',
    storageClass: 'temporary',
    sourceTitle,
    filename: 'temporary.png',
    blob: new Blob(['temporary'], { type: 'image/png' }),
  });
  expect(saved.sourceTitle).toBe(sourceTitle);
  expect(fixture.rows.get('media_library')!.get(saved.id)).toMatchObject({
    lifecycle: { storageClass: 'temporary' },
  });
  expect(fixture.rows.get('sync_capture')!.size).toBe(1);
  const before = structuredClone(fixture.rows);
  await expect(promoteImageAggregate(saved.id, 0)).rejects.toThrow('snapshot');
  expect(fixture.rows).toEqual(before);
});
