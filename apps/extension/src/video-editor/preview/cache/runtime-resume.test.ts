// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoPreviewExactFrameCache } from './exact-frame-cache';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  canEncode: vi.fn(),
  commit: vi.fn(),
  createMaterializer: vi.fn(),
  encode: vi.fn(),
  load: vi.fn(),
  segmentPlan: vi.fn(),
}));

vi.mock('../../../composition/persistence/video-preview-cache', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/video-preview-cache')
  >()),
  beginVideoPreviewCacheJob: mocks.begin,
  cleanupVideoPreviewCache: vi.fn(() => Promise.resolve({ removedCount: 0 })),
  commitVideoPreviewCacheRecord: mocks.commit,
  loadVideoPreviewCacheRecord: mocks.load,
  touchVideoPreviewCacheRecord: vi.fn(() => Promise.resolve(true)),
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

function createProject() {
  return { ...createEmptyVideoProject('Resumable', 2560, 1440), duration: 4, fps: 10 };
}

function configureTwoSegments(): void {
  mocks.segmentPlan.mockResolvedValue([
    { endFrame: 20, fingerprint: `sha256:${'b'.repeat(64)}`, index: 0, startFrame: 0 },
    { endFrame: 41, fingerprint: `sha256:${'c'.repeat(64)}`, index: 1, startFrame: 20 },
  ]);
}

function build(project: ReturnType<typeof createProject>) {
  return buildVideoPreviewCache({
    assetUrls: {},
    cache: createVideoPreviewExactFrameCache(1024),
    onProgress: vi.fn(),
    ownerDocument: document,
    playbackRange: null,
    project,
    rasterSize: { height: 1440, width: 2560 },
    signal: new AbortController().signal,
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.begin.mockResolvedValue({
    databaseInstanceId: crypto.randomUUID(),
    jobId: crypto.randomUUID(),
  });
  mocks.canEncode.mockResolvedValue(true);
  mocks.commit.mockResolvedValue(undefined);
  mocks.createMaterializer.mockReturnValue({
    canvas: document.createElement('canvas'),
    dispose: vi.fn(),
    renderFrame: vi.fn(),
  });
  vi.stubGlobal('MediaSource', { isTypeSupported: vi.fn(() => true) });
  configureTwoSegments();
});

it('commits each completed persistent segment before a later segment is paused', async () => {
  const firstBlob = new Blob(['first'], { type: 'video/mp4' });
  mocks.load.mockResolvedValue(null);
  mocks.encode
    .mockResolvedValueOnce({ blob: firstBlob, codec: 'avc1.640033' })
    .mockRejectedValueOnce(new DOMException('paused', 'AbortError'));

  await expect(build(createProject())).rejects.toThrow('paused');

  expect(mocks.commit).toHaveBeenCalledOnce();
  expect(mocks.commit.mock.calls[0]?.[1]).toMatchObject({
    codec: 'avc1.640033',
    segments: [{ blob: firstBlob, index: 0 }],
  });
});

it('rebuilds restored segments when the current encoder reports another codec identity', async () => {
  const project = createProject();
  const rebuiltFirst = new Blob(['rebuilt-first'], { type: 'video/mp4' });
  const rebuiltSecond = new Blob(['rebuilt-second'], { type: 'video/mp4' });
  mocks.load.mockResolvedValue({
    codec: 'avc1.42E01E',
    fps: 10,
    height: 1440,
    projectId: project.id,
    range: { endFrame: 41, startFrame: 0 },
    segments: [
      {
        blob: new Blob(['old'], { type: 'video/mp4' }),
        endFrame: 20,
        fingerprint: `sha256:${'b'.repeat(64)}`,
        index: 0,
        startFrame: 0,
      },
    ],
    width: 2560,
  });
  mocks.encode
    .mockResolvedValueOnce({ blob: new Blob(['mismatch']), codec: 'avc1.640033' })
    .mockResolvedValueOnce({ blob: rebuiltFirst, codec: 'avc1.640033' })
    .mockResolvedValueOnce({ blob: rebuiltSecond, codec: 'avc1.640033' });

  const result = await build(project);

  expect(mocks.encode).toHaveBeenCalledTimes(3);
  expect(result.cachedVideo).toMatchObject({
    codec: 'avc1.640033',
    segments: [rebuiltFirst, rebuiltSecond],
  });
});
