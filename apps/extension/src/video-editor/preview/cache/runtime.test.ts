// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoPreviewExactFrameCache } from './exact-frame-cache';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  canEncode: vi.fn(),
  cleanup: vi.fn(),
  commit: vi.fn(),
  createMaterializer: vi.fn(),
  encode: vi.fn(),
  load: vi.fn(),
  segmentPlan: vi.fn(),
  touch: vi.fn(),
}));

vi.mock('../../../composition/persistence/video-preview-cache', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/video-preview-cache')
  >()),
  beginVideoPreviewCacheJob: mocks.begin,
  cleanupVideoPreviewCache: mocks.cleanup,
  commitVideoPreviewCacheRecord: mocks.commit,
  loadVideoPreviewCacheRecord: mocks.load,
  touchVideoPreviewCacheRecord: mocks.touch,
}));

vi.mock('./encode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./encode')>()),
  canEncodePersistentVideoPreview: mocks.canEncode,
  encodePersistentVideoPreview: mocks.encode,
}));

vi.mock('./materializer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./materializer')>()),
  createVideoPreviewFrameMaterializer: mocks.createMaterializer,
}));

vi.mock('./revision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./revision')>()),
  createVideoPreviewRenderRevision: vi.fn(() => Promise.resolve(`sha256:${'a'.repeat(64)}`)),
}));

vi.mock('./segments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./segments')>()),
  createVideoPreviewCacheSegmentPlan: mocks.segmentPlan,
}));

import { buildVideoPreviewCache } from './runtime';

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.begin.mockResolvedValue({
    databaseInstanceId: crypto.randomUUID(),
    jobId: crypto.randomUUID(),
  });
  mocks.cleanup.mockResolvedValue({ removedCount: 0 });
  mocks.commit.mockResolvedValue(undefined);
  mocks.segmentPlan.mockImplementation(
    (_project: unknown, range: { endFrame: number; startFrame: number }) =>
      Promise.resolve([
        {
          ...range,
          fingerprint: `sha256:${'b'.repeat(64)}`,
          index: 0,
        },
      ])
  );
  mocks.touch.mockResolvedValue(true);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() =>
      Promise.resolve({
        close: vi.fn(),
        height: 2,
        width: 2,
      })
    )
  );
  vi.stubGlobal('MediaSource', {
    isTypeSupported: vi.fn(() => true),
  });
});

it('uses a complete persistent record without materializing frames', async () => {
  const project = { ...createEmptyVideoProject('Cached', 2560, 1440), duration: 1 };
  const blob = new Blob(['cached'], { type: 'video/mp4' });
  mocks.load.mockResolvedValue({
    codec: 'avc1.640033',
    fps: 30,
    height: 1440,
    mimeType: 'video/mp4',
    projectId: project.id,
    range: { endFrame: 31, startFrame: 0 },
    segments: [
      {
        blob,
        endFrame: 31,
        fingerprint: `sha256:${'b'.repeat(64)}`,
        index: 0,
        startFrame: 0,
      },
    ],
    width: 2560,
  });

  const result = await buildVideoPreviewCache({
    assetUrls: {},
    cache: createVideoPreviewExactFrameCache(1024),
    onProgress: vi.fn(),
    ownerDocument: document,
    playbackRange: null,
    project,
    rasterSize: { height: 1440, width: 2560 },
    signal: new AbortController().signal,
  });

  expect(result.outcome).toBe('video-cache-ready');
  expect(result.cachedVideo?.segments).toEqual([blob]);
  expect(mocks.touch).toHaveBeenCalledOnce();
  expect(mocks.createMaterializer).not.toHaveBeenCalled();
});

it('falls back to a complete exact-frame cache when AVC encoding is unavailable', async () => {
  const project = { ...createEmptyVideoProject('Frames', 2, 2), duration: 0.1, fps: 10 };
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const materializer = {
    canvas,
    dispose: vi.fn(),
    renderFrame: vi.fn((_time: number, _signal: AbortSignal) => Promise.resolve(canvas)),
  };
  mocks.load.mockResolvedValue(null);
  mocks.canEncode.mockResolvedValue(false);
  mocks.createMaterializer.mockReturnValue(materializer);

  const result = await buildVideoPreviewCache({
    assetUrls: {},
    cache: createVideoPreviewExactFrameCache(1024),
    onProgress: vi.fn(),
    ownerDocument: document,
    playbackRange: null,
    project,
    rasterSize: { height: 2, width: 2 },
    signal: new AbortController().signal,
  });

  expect(result.outcome).toBe('frame-cache-ready');
  expect(materializer.renderFrame).toHaveBeenCalledTimes(2);
  expect(materializer.renderFrame.mock.calls.map(([time]) => time)).toEqual([0, 0.1]);
  expect(materializer.dispose).toHaveBeenCalledOnce();
});

it('reports unavailable instead of claiming a frame cache when bitmaps cannot be retained', async () => {
  vi.stubGlobal('createImageBitmap', undefined);
  const project = { ...createEmptyVideoProject('No bitmaps', 2, 2), duration: 0.1, fps: 10 };
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  mocks.canEncode.mockResolvedValue(false);
  mocks.createMaterializer.mockReturnValue({
    canvas,
    dispose: vi.fn(),
    renderFrame: vi.fn(() => Promise.resolve(canvas)),
  });

  const result = await buildVideoPreviewCache({
    assetUrls: {},
    cache: createVideoPreviewExactFrameCache(1024),
    onProgress: vi.fn(),
    ownerDocument: document,
    playbackRange: null,
    project,
    rasterSize: { height: 2, width: 2 },
    signal: new AbortController().signal,
  });

  expect(result).toEqual({ cachedVideo: null, outcome: 'unavailable' });
});

it('keeps a session video cache when the persistence job cannot start', async () => {
  const project = {
    ...createEmptyVideoProject('Session', 2560, 1440),
    duration: 0.1,
    fps: 10,
  };
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const encoded = new Blob(['encoded'], { type: 'video/mp4' });
  const materializer = {
    canvas,
    dispose: vi.fn(),
    renderFrame: vi.fn(() => Promise.resolve(canvas)),
  };
  mocks.load.mockResolvedValue(null);
  mocks.canEncode.mockResolvedValue(true);
  mocks.begin.mockRejectedValue(new Error('IndexedDB unavailable'));
  mocks.encode.mockResolvedValue({ blob: encoded, codec: 'avc1.640033' });
  mocks.createMaterializer.mockReturnValue(materializer);

  const result = await buildVideoPreviewCache({
    assetUrls: {},
    cache: createVideoPreviewExactFrameCache(1024),
    onProgress: vi.fn(),
    ownerDocument: document,
    playbackRange: null,
    project,
    rasterSize: { height: 1440, width: 2560 },
    signal: new AbortController().signal,
  });

  expect(result).toMatchObject({
    cachedVideo: { segments: [encoded] },
    outcome: 'video-cache-ready',
  });
  expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.encode.mock.invocationCallOrder[0] ?? 0
  );
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(materializer.dispose).toHaveBeenCalledOnce();
});

function configurePartialSegmentReuse() {
  const project = { ...createEmptyVideoProject('Partial', 2560, 1440), duration: 4, fps: 10 };
  const firstBlob = new Blob(['first'], { type: 'video/mp4' });
  const secondBlob = new Blob(['second'], { type: 'video/mp4' });
  mocks.segmentPlan.mockResolvedValue([
    {
      endFrame: 20,
      fingerprint: `sha256:${'b'.repeat(64)}`,
      index: 0,
      startFrame: 0,
    },
    {
      endFrame: 41,
      fingerprint: `sha256:${'c'.repeat(64)}`,
      index: 1,
      startFrame: 20,
    },
  ]);
  mocks.load.mockResolvedValue({
    codec: 'avc1.640033',
    fps: 10,
    height: 1440,
    projectId: project.id,
    range: { endFrame: 41, startFrame: 0 },
    segments: [
      {
        blob: firstBlob,
        endFrame: 20,
        fingerprint: `sha256:${'b'.repeat(64)}`,
        index: 0,
        startFrame: 0,
      },
    ],
    width: 2560,
  });
  mocks.canEncode.mockResolvedValue(true);
  mocks.encode.mockResolvedValue({ blob: secondBlob, codec: 'avc1.640033' });
  mocks.createMaterializer.mockReturnValue({
    canvas: document.createElement('canvas'),
    dispose: vi.fn(),
    renderFrame: vi.fn(),
  });
  return { firstBlob, project, secondBlob };
}

it('reuses matching persistent segments and encodes only a changed segment', async () => {
  const { firstBlob, project, secondBlob } = configurePartialSegmentReuse();

  const result = await buildVideoPreviewCache({
    assetUrls: {},
    cache: createVideoPreviewExactFrameCache(1024),
    onProgress: vi.fn(),
    ownerDocument: document,
    playbackRange: null,
    project,
    rasterSize: { height: 1440, width: 2560 },
    signal: new AbortController().signal,
  });

  expect(mocks.encode).toHaveBeenCalledOnce();
  expect(mocks.encode).toHaveBeenCalledWith(
    expect.objectContaining({ endFrame: 41, startFrame: 20 })
  );
  expect(result.cachedVideo?.segments).toEqual([firstBlob, secondBlob]);
  expect(mocks.commit.mock.calls[0]?.[1]).toMatchObject({
    segments: [
      { blob: firstBlob, fingerprint: `sha256:${'b'.repeat(64)}` },
      { blob: secondBlob, fingerprint: `sha256:${'c'.repeat(64)}` },
    ],
  });
});
