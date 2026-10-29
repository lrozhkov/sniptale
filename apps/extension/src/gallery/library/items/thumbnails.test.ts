import { createRemoteRootGalleryItem } from './adapters';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaItem,
  createScenarioItem,
  createVideoProjectItem,
} from '../actions/test-support/index';

const {
  readRemoteThumbnailMock,
  waitRemoteMock,
  cancelRemoteMock,
  createImageThumbnailBlobMock,
  createVideoThumbnailBlobMock,
  dataUrlToBlobMock,
  getAggregatePresentationMock,
  getMediaAssetBlobMock,
  getMediaThumbnailMock,
  getGalleryProjectCoverMock,
  listRecentScenarioStepsMock,
  saveMediaThumbnailMock,
} = vi.hoisted(() => ({
  readRemoteThumbnailMock: vi.fn(),
  waitRemoteMock: vi.fn(),
  cancelRemoteMock: vi.fn().mockResolvedValue(undefined),
  createImageThumbnailBlobMock: vi.fn(),
  createVideoThumbnailBlobMock: vi.fn(),
  dataUrlToBlobMock: vi.fn(),
  getAggregatePresentationMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  getMediaThumbnailMock: vi.fn(),
  getGalleryProjectCoverMock: vi.fn(),
  listRecentScenarioStepsMock: vi.fn(),
  saveMediaThumbnailMock: vi.fn(),
}));

vi.mock('../../../platform/runtime-messaging/sync-product-client', () => ({
  createSyncProductClient: () => ({
    readThumbnail: readRemoteThumbnailMock,
    waitForOperation: waitRemoteMock,
    cancel: cancelRemoteMock,
  }),
}));

vi.mock('./project-covers', () => ({ getGalleryProjectCover: getGalleryProjectCoverMock }));

vi.mock('../../../composition/persistence/aggregate-presentations', () => ({
  getAggregatePresentation: getAggregatePresentationMock,
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/media-library/index.library.ts')
    >()),
    getMediaAssetBlob: getMediaAssetBlobMock,
    getMediaThumbnail: getMediaThumbnailMock,
    saveMediaThumbnail: saveMediaThumbnailMock,
  })
);

vi.mock(
  '../../../composition/persistence/scenario/store/project-steps/project-step-queries',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/scenario/store/project-steps/project-step-queries')
    >()),
    listRecentScenarioSteps: listRecentScenarioStepsMock,
  })
);

vi.mock('../../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: createImageThumbnailBlobMock,
}));

vi.mock('../../../platform/media-utils/video-thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/video-thumbnails')>()),
  createVideoThumbnailBlob: createVideoThumbnailBlobMock,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: dataUrlToBlobMock,
}));

import { ensureGalleryItemThumbnail } from './thumbnails';

beforeEach(() => {
  vi.clearAllMocks();
  getAggregatePresentationMock.mockResolvedValue(undefined);
  getGalleryProjectCoverMock.mockResolvedValue(undefined);
});

it('returns existing thumbnails without rebuilding them', async () => {
  const existingThumbnail = {
    assetId: 'asset-1',
    blob: new Blob(['thumb'], { type: 'image/png' }),
    createdAt: 1,
    generatorVersion: 2,
    updatedAt: 2,
    width: 320,
    height: 180,
  };
  getMediaThumbnailMock.mockResolvedValue(existingThumbnail);

  await expect(
    ensureGalleryItemThumbnail(
      createMediaItem({ id: 'asset-1', kind: 'recording', mimeType: 'video/webm' })
    )
  ).resolves.toEqual(existingThumbnail);
  expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  expect(saveMediaThumbnailMock).not.toHaveBeenCalled();
});

it('renders a scenario image thumbnail from its stored asset', async () => {
  const source = new Blob(['image'], { type: 'image/png' });
  const thumbnail = new Blob(['thumbnail'], { type: 'image/png' });
  getMediaThumbnailMock.mockResolvedValue(undefined);
  getMediaAssetBlobMock.mockResolvedValue(source);
  createImageThumbnailBlobMock.mockResolvedValue(thumbnail);

  const result = await ensureGalleryItemThumbnail(
    createMediaItem({
      id: 'scenario-image-1',
      kind: 'image',
      source: { kind: 'stored-asset', assetId: 'scenario-image-1' },
    })
  );

  expect(getAggregatePresentationMock).not.toHaveBeenCalled();
  expect(getMediaAssetBlobMock).toHaveBeenCalledWith('scenario-image-1');
  expect(createImageThumbnailBlobMock).toHaveBeenCalledWith(source, 320, 180, undefined);
  expect(saveMediaThumbnailMock).toHaveBeenCalledWith(
    expect.objectContaining({ assetId: 'scenario-image-1', blob: thumbnail })
  );
  expect(result?.blob).toBe(thumbnail);
});

it('rebuilds legacy video thumbnails with the current renderer revision', async () => {
  const legacyThumbnail = {
    assetId: 'asset-1',
    blob: new Blob(['blue-frame'], { type: 'image/webp' }),
    createdAt: 1,
    updatedAt: 2,
    width: 320,
    height: 180,
  };
  const videoBlob = new Blob(['video'], { type: 'video/webm' });
  const rebuiltBlob = new Blob(['content-frame'], { type: 'image/webp' });
  getMediaThumbnailMock.mockResolvedValue(legacyThumbnail);
  getMediaAssetBlobMock.mockResolvedValue(videoBlob);
  createVideoThumbnailBlobMock.mockResolvedValue(rebuiltBlob);

  const result = await ensureGalleryItemThumbnail(
    createMediaItem({ id: 'asset-1', kind: 'recording', mimeType: 'video/webm' })
  );

  expect(createVideoThumbnailBlobMock).toHaveBeenCalledWith(videoBlob, 320, 180);
  expect(saveMediaThumbnailMock).toHaveBeenCalledWith(
    expect.objectContaining({
      assetId: 'asset-1',
      blob: rebuiltBlob,
      generatorVersion: 2,
    })
  );
  expect(result?.generatorVersion).toBe(2);
});

it('deduplicates media thumbnail generation and persists the generated entry', async () => {
  const videoBlob = new Blob(['video'], { type: 'video/webm' });
  const thumbnailBlob = new Blob(['thumb'], { type: 'image/png' });
  getMediaThumbnailMock.mockResolvedValue(undefined);
  getMediaAssetBlobMock.mockResolvedValue(videoBlob);
  createVideoThumbnailBlobMock.mockResolvedValue(thumbnailBlob);

  const item = createMediaItem({
    id: 'asset-1',
    kind: 'recording',
    mimeType: 'video/webm',
  });

  const [first, second] = await Promise.all([
    ensureGalleryItemThumbnail(item),
    ensureGalleryItemThumbnail(item),
  ]);

  expect(createVideoThumbnailBlobMock).toHaveBeenCalledTimes(1);
  expect(saveMediaThumbnailMock).toHaveBeenCalledTimes(1);
  expect(first).toEqual(second);
  expect(first).toMatchObject({
    assetId: 'asset-1',
    generatorVersion: 2,
    width: 320,
    height: 180,
  });
});

it('uses a disposable Gallery cover for scenarios', async () => {
  const thumbnailBlob = new Blob(['thumb'], { type: 'image/png' });
  getGalleryProjectCoverMock.mockResolvedValueOnce(thumbnailBlob);

  const result = await ensureGalleryItemThumbnail(
    createScenarioItem({
      id: 'scenario:project-1',
      project: {
        availability: 'available' as const,
        createdAt: 1,
        id: 'project-1',
        name: 'Scenario',
        tags: [],
        updatedAt: 2,
      },
    })
  );

  expect(getAggregatePresentationMock).not.toHaveBeenCalled();
  expect(getGalleryProjectCoverMock).toHaveBeenCalledOnce();
  expect(listRecentScenarioStepsMock).not.toHaveBeenCalled();
  expect(saveMediaThumbnailMock).not.toHaveBeenCalled();
  expect(result).toMatchObject({ assetId: 'scenario:project-1' });
});

it('does not read an old aggregate poster for a current video project', async () => {
  const thumbnailBlob = new Blob(['thumb'], { type: 'image/png' });
  getAggregatePresentationMock.mockResolvedValueOnce({
    presentationRevision: 2,
    thumbnailBlob,
    updatedAt: 4,
  });

  const result = await ensureGalleryItemThumbnail(
    createVideoProjectItem({
      id: 'video-project:project-1',
      thumbnailSourceMediaId: 'project-asset:asset-1',
    })
  );

  expect(getAggregatePresentationMock).not.toHaveBeenCalled();
  expect(getGalleryProjectCoverMock).toHaveBeenCalledOnce();
  expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  expect(saveMediaThumbnailMock).not.toHaveBeenCalled();
  expect(result?.blob).not.toBe(thumbnailBlob);
});

it('uses the existing source thumbnail for quick-edit without decoding or copying source bytes', async () => {
  const { createQuickEditProjectGalleryItem } = await import('./adapters');
  const { ensureGalleryItemThumbnail } = await import('./thumbnails');
  const item = createQuickEditProjectGalleryItem({
    aggregateId: 'source',
    name: 'Saved edit',
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    source: null,
    unavailableReason: null,
  });
  const thumbnail = {
    assetId: 'source',
    blob: new Blob(['thumbnail']),
    createdAt: 1,
    updatedAt: 1,
    width: 320,
    height: 180,
  };
  getMediaThumbnailMock.mockResolvedValue(thumbnail);
  expect(await ensureGalleryItemThumbnail(item)).toEqual({ ...thumbnail, assetId: item.id });
  expect(getMediaThumbnailMock).toHaveBeenCalledWith('source');
  expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  expect(createVideoThumbnailBlobMock).not.toHaveBeenCalled();
  expect(saveMediaThumbnailMock).not.toHaveBeenCalled();
});

it('loads only the selected remote thumbnail and never reads or writes native media', async () => {
  const item = createRemoteRootGalleryItem({
    source: 'remote',
    tags: [],
    label: 'Remote',
    kind: 'image',
    mimeType: 'image/png',
    size: 10,
    createdAt: 1,
    updatedAt: 2,
    conflict: false,
    unavailable: false,
    deleted: false,
    selection: {
      rootKind: 'media',
      rootId: 'remote',
      operationId: 'operation',
      sourceDigest: 'a'.repeat(64),
    },
  });
  const blob = new Blob(['thumbnail'], { type: 'image/png' });
  readRemoteThumbnailMock.mockResolvedValueOnce({ kind: 'accepted', requestId: 'thumbnail-job' });
  waitRemoteMock.mockResolvedValueOnce({
    kind: 'operation',
    job: { state: 'ready' },
    completion: {
      kind: 'thumbnail',
      dataUrl: 'data:image/png;base64,dGh1bWI=',
      width: 320,
      height: 180,
    },
  });
  dataUrlToBlobMock.mockResolvedValueOnce(blob);
  const result = await ensureGalleryItemThumbnail(item, new AbortController().signal);
  expect(result?.blob).toBe(blob);
  expect(readRemoteThumbnailMock).toHaveBeenCalledWith(item.remote.selection);
  expect(getMediaThumbnailMock).not.toHaveBeenCalled();
  expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  expect(saveMediaThumbnailMock).not.toHaveBeenCalled();
});

it('waits for four thumbnails without polling and cancels their work on release', async () => {
  vi.useFakeTimers();
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  let allStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    allStarted = resolve;
  });
  let count = 0;
  readRemoteThumbnailMock.mockImplementation((selection: { rootId: string }) => ({
    kind: 'accepted',
    requestId: selection.rootId,
  }));
  waitRemoteMock.mockImplementation((_requestId: string, signal: AbortSignal) => {
    count += 1;
    if (count === 4) allStarted();
    return new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
        once: true,
      });
    });
  });
  const waits = controllers.map((controller, index) =>
    ensureGalleryItemThumbnail(
      createRemoteRootGalleryItem({
        source: 'remote',
        tags: [],
        label: `Remote ${index}`,
        kind: 'image',
        mimeType: 'image/png',
        size: 10,
        createdAt: 1,
        updatedAt: 2,
        conflict: false,
        unavailable: false,
        deleted: false,
        selection: {
          rootKind: 'media',
          rootId: `remote-${index}`,
          operationId: `operation-${index}`,
          sourceDigest: 'a'.repeat(64),
        },
      }),
      controller.signal
    )
  );
  try {
    await started;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(readRemoteThumbnailMock).toHaveBeenCalledTimes(4);
    expect(waitRemoteMock).toHaveBeenCalledTimes(4);
    controllers.forEach((controller) => controller.abort());
    await expect(Promise.all(waits)).resolves.toEqual([undefined, undefined, undefined, undefined]);
    expect(cancelRemoteMock).toHaveBeenCalledTimes(4);
    for (let index = 0; index < 4; index += 1)
      expect(cancelRemoteMock).toHaveBeenCalledWith(`remote-${index}`, true);
    expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
    expect(saveMediaThumbnailMock).not.toHaveBeenCalled();
  } finally {
    controllers.forEach((controller) => controller.abort());
    await Promise.all(waits);
    vi.useRealTimers();
  }
});
