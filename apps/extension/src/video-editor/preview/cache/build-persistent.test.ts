// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { buildPersistentVideoPreview } from './build-persistent';
import {
  createVideoPreviewExactFrameCache,
  createVideoPreviewExactFrameKey,
} from './exact-frame-cache';
import type { FreshVideoPreviewBuildContext } from './runtime-support';

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  dispose: vi.fn(),
  createOutputs: vi.fn(),
  encode: vi.fn(),
  commit: vi.fn(),
}));
vi.mock('./materializer-gpu-outputs', () => ({
  createMaterializerGpuOutputs: mocks.createOutputs,
}));
vi.mock('./encode', () => ({ encodePersistentVideoPreview: mocks.encode }));
vi.mock('../../../composition/persistence/video-preview-cache', async (original) => ({
  ...(await original<typeof import('../../../composition/persistence/video-preview-cache')>()),
  beginVideoPreviewCacheJob: vi.fn(async () => null),
  commitVideoPreviewCacheRecord: mocks.commit,
  cleanupVideoPreviewCache: vi.fn(async () => ({ removedCount: 0 })),
}));

function fixture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const output = { canvas: document.createElement('canvas'), release: vi.fn() };
  output.canvas.width = output.canvas.height = 2;
  const controller = new AbortController();
  const project = { ...createEmptyVideoProject('Encoded GPU cache', 2, 2), duration: 0.1, fps: 10 };
  const render = vi.fn(async () => ({
    canvas,
    presentation: {
      camera: resolveVideoCompositionFrame(project, 0).camera,
      time: 0,
      output,
    },
  }));
  const context: FreshVideoPreviewBuildContext = {
    exactFrameCapacity: 1,
    materializer: {
      canvas,
      renderFrame: vi.fn(),
      renderFrameWithPresentation: render,
      dispose: vi.fn(),
      updateProject: () => false,
    },
    params: {
      assetUrls: {},
      cache: createVideoPreviewExactFrameCache(32),
      onProgress: vi.fn(),
      ownerDocument: document,
      playbackRange: null,
      project,
      rasterSize: { width: 2, height: 2 },
      signal: controller.signal,
    },
    range: { startFrame: 0, endFrame: 1 },
    renderRevision: `sha256:${'a'.repeat(64)}`,
  };
  const build = () =>
    buildPersistentVideoPreview({
      context,
      codec: null,
      restored: [null],
      plan: [{ index: 0, startFrame: 0, endFrame: 1, fingerprint: `sha256:${'b'.repeat(64)}` }],
      storageKey: 'encoded-gpu-cache',
    });
  return { context, output, render, controller, build };
}

interface FrameLease {
  canvas: HTMLCanvasElement;
  release(): void;
}
function isFrameLease(value: unknown): value is FrameLease {
  return (
    typeof value === 'object' &&
    value !== null &&
    'canvas' in value &&
    value.canvas instanceof HTMLCanvasElement &&
    'release' in value &&
    typeof value.release === 'function'
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createOutputs.mockReturnValue({ acquire: mocks.acquire, dispose: mocks.dispose });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() }))
  );
});

it.each(['capture', 'already-cached', 'capacity-exhausted'] as const)(
  'keeps the completed GPU frame through encoder consumption when exact cache is %s',
  async (path) => {
    const f = fixture();
    if (path === 'already-cached')
      f.context.params.cache.set(
        createVideoPreviewExactFrameKey({
          renderRevision: f.context.renderRevision,
          fps: 10,
          width: 2,
          height: 2,
          frameIndex: 0,
        }),
        { width: 2, height: 2, close: vi.fn() } as unknown as ImageBitmap
      );
    if (path === 'capacity-exhausted') f.context.exactFrameCapacity = 0;
    mocks.encode.mockImplementation(
      async (params: { onFrame(index: number): Promise<unknown> }) => {
        const frame = await params.onFrame(0);
        expect(f.output.release).not.toHaveBeenCalled();
        expect(isFrameLease(frame)).toBe(true);
        if (!isFrameLease(frame)) throw new Error('Completed encoder frame is unavailable');
        expect(frame.canvas).toBe(f.output.canvas);
        expect(mocks.dispose).not.toHaveBeenCalled();
        frame.release();
        return { blob: new Blob(['encoded']), codec: 'avc1.640033' };
      }
    );
    await expect(f.build()).resolves.toMatchObject({ outcome: 'video-cache-ready' });
    expect(f.render).toHaveBeenCalledWith(0, f.controller.signal, undefined, mocks.acquire);
    expect(mocks.createOutputs).toHaveBeenCalledWith(document);
    expect(f.output.release).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(f.output.release.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.dispose.mock.invocationCallOrder[0]!
    );
    if (path === 'capture') {
      expect(vi.mocked(createImageBitmap).mock.calls[0]?.[0]).toBe(f.output.canvas);
      expect(
        f.context.params.cache.getPresentation(
          createVideoPreviewExactFrameKey({
            renderRevision: f.context.renderRevision,
            fps: 10,
            width: 2,
            height: 2,
            frameIndex: 0,
          })
        )
      ).not.toHaveProperty('output');
    } else expect(createImageBitmap).not.toHaveBeenCalled();
  }
);

it('releases a failed snapshot output before retiring private GPU destinations', async () => {
  const f = fixture();
  vi.mocked(createImageBitmap).mockRejectedValue(new Error('Snapshot failed'));
  mocks.encode.mockImplementation(async (params: { onFrame(index: number): Promise<unknown> }) => {
    await params.onFrame(0);
    throw new Error('Unreachable encoder add');
  });
  await expect(f.build()).rejects.toThrow('Snapshot failed');
  expect(f.output.release).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(mocks.commit).not.toHaveBeenCalled();
});

it('drains an aborted pending snapshot before releasing its GPU frame', async () => {
  const f = fixture();
  let finish!: (value: ImageBitmap) => void;
  const bitmap = { width: 2, height: 2, close: vi.fn() };
  vi.mocked(createImageBitmap).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  mocks.encode.mockImplementation(async (params: { onFrame(index: number): Promise<unknown> }) => {
    await params.onFrame(0);
    throw new Error('Unreachable encoder add');
  });
  const build = f.build();
  const rejected = expect(build).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());
  f.controller.abort();
  expect(f.output.release).not.toHaveBeenCalled();
  expect(mocks.dispose).not.toHaveBeenCalled();
  finish(bitmap as unknown as ImageBitmap);
  await rejected;
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(f.output.release).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(f.context.params.cache.byteLength).toBe(0);
});

it.each(['legacy', 'unavailable'] as const)(
  'keeps the Canvas frame when the GPU route is %s',
  async (route) => {
    const f = fixture();
    if (route === 'legacy') f.context.params.previewRenderer = 'legacy';
    f.context.materializer.renderFrameWithPresentation = vi.fn(async () => ({
      canvas: f.context.materializer.canvas,
      presentation: {
        camera: resolveVideoCompositionFrame(f.context.params.project, 0).camera,
        time: 0,
        renderer: { backend: 'legacy' as const },
      },
    }));
    mocks.encode.mockImplementation(
      async (params: { onFrame(index: number): Promise<unknown> }) => {
        const frame = await params.onFrame(0);
        expect(isFrameLease(frame)).toBe(true);
        if (!isFrameLease(frame)) throw new Error('Fallback encoder frame is unavailable');
        expect(frame.canvas).toBe(f.context.materializer.canvas);
        frame.release();
        return { blob: new Blob(['encoded']), codec: 'avc1.640033' };
      }
    );
    await expect(f.build()).resolves.toMatchObject({ outcome: 'video-cache-ready' });
    if (route === 'legacy') expect(mocks.createOutputs).not.toHaveBeenCalled();
    else expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(f.output.release).not.toHaveBeenCalled();
  }
);
