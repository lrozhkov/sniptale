// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as framePlan from '../stage/scene/frame-plan';
import type { PreviewSceneRenderInput } from '../stage/scene/types';
import type { PreviewSourceProvider } from '../../../workflows/video/preview-source';
import {
  createProject,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
import { createVideoPreviewFrameMaterializer } from './materializer';

const io = vi.hoisted(() => ({
  create: vi.fn(),
  render: vi.fn(),
}));
vi.mock('../../../workflows/video/preview-source', async (original) => ({
  ...(await original<typeof import('../../../workflows/video/preview-source')>()),
  createPreviewSourceProvider: io.create,
}));
vi.mock('../stage/scene/render-preview', () => ({ renderPreviewScene: io.render }));
vi.mock('../../../workflows/video-review/recording-events', () => ({
  createRecordingEventsRenderer: () => ({
    prepare: async (project: PreviewSceneRenderInput['project']) => ({
      ...project,
      name: 'Hydrated source',
    }),
    clear() {},
  }),
}));

class SourceFrame {
  timestamp = 1_250_000;
  duration = 33333;
  displayWidth = 640;
  displayHeight = 360;
  close = vi.fn();
  clone() {
    return new SourceFrame();
  }
}
function fixture(renderer: 'gpu' | 'legacy' = 'gpu') {
  vi.stubGlobal('VideoFrame', SourceFrame);
  vi.stubGlobal('VideoDecoder', class {});
  const clip = createVideoClip({
    id: 'source',
    assetId: 'asset',
    startTime: 0,
    duration: 5,
    sourceDuration: 5,
  });
  const project = createProject([clip]);
  const frames: SourceFrame[] = [];
  const release = vi.fn();
  const provider: PreviewSourceProvider = {
    acquire: vi.fn<PreviewSourceProvider['acquire']>(async (demands) => ({
      bindings: new Map(
        demands.map((demand) => [
          demand.id,
          {
            source: {
              sourceWidth: 640,
              sourceHeight: 360,
              orientation: { rotation: 90 as const, flip: true },
              draw: vi.fn(),
              toVideoFrame: () => {
                const frame = new SourceFrame();
                frames.push(frame);
                return frame as unknown as VideoFrame;
              },
            },
            timestamp: 1.25,
            nextTimestamp: 1.283333,
            target: demand.time,
            url: demand.url,
          },
        ])
      ),
      release,
    })),
    retainSources: vi.fn(),
    dispose: vi.fn(),
  };
  io.create.mockReturnValue(provider);
  const owner = createVideoPreviewFrameMaterializer({
    assetUrls: { asset: 'blob:bound-source' },
    ownerDocument: document,
    project,
    rasterSize: { width: 320, height: 180 },
    previewRenderer: renderer,
  });
  return { owner, project, provider, release, frames };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.render.mockImplementation(async (input: PreviewSceneRenderInput) => ({
    time: input.currentTime,
    camera:
      input.cameraOverride ?? resolveVideoCompositionFrame(input.project, input.currentTime).camera,
    renderer: { backend: 'gpu' },
  }));
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === 'video')
      Object.defineProperties(node, {
        readyState: { value: 4 },
        seeking: { value: false },
        pause: { value: vi.fn() },
        load: { value: vi.fn() },
      });
    return node;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('renders canonical PTS and orientation with the requested camera instead of HTML capture', async () => {
  const f = fixture();
  const camera = { ...resolveVideoCompositionFrame(f.project, 1.26).camera, scale: 1.75 };
  io.render.mockImplementationOnce(async (input: PreviewSceneRenderInput) => {
    expect(input.project.name).toBe('Hydrated source');
    expect(input.preparedFrame?.sourcePresentation.get('source')).toEqual({
      timestampUs: 1_250_000,
      durationUs: 33333,
    });
    expect(input.preparedFrame?.passes.overlayFrame.camera).toBe(camera);
    expect(input.decodedVideoFrames?.get('source')?.orientation).toEqual({
      rotation: 90,
      flip: true,
    });
    expect(input.cameraOverride).toBe(camera);
    expect(input.videoRefs.current).toEqual({});
    return { time: input.currentTime, camera, renderer: { backend: 'gpu' } };
  });
  try {
    const result = await f.owner.renderFrameWithPresentation(
      1.26,
      new AbortController().signal,
      camera
    );
    expect(result.presentation.camera).toBe(camera);
    expect(f.provider.retainSources).toHaveBeenCalledWith(new Set(['blob:bound-source']));
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.frames[0]!.close).toHaveBeenCalledOnce();
    expect(document.querySelector('video')).toBeNull();
  } finally {
    f.owner.dispose();
  }
  expect(f.provider.dispose).toHaveBeenCalledOnce();
});

it.each([
  ['gpu', 'complete'],
  ['gpu', 'abort'],
  ['gpu', 'dispose'],
  ['legacy', 'complete'],
  ['legacy', 'abort'],
  ['legacy', 'dispose'],
] as const)(
  'retains %s source preparation through pending completion on %s',
  async (renderer, operation) => {
    const f = fixture(renderer);
    const controller = new AbortController();
    const fence = Promise.withResolvers<void>();
    io.render.mockImplementationOnce(async (input: PreviewSceneRenderInput) => {
      expect(input.preparedFrame).toBeDefined();
      await fence.promise;
      return {
        time: input.currentTime,
        camera: resolveVideoCompositionFrame(input.project, input.currentTime).camera,
      };
    });
    const pending = f.owner.renderFrameWithPresentation(1.26, controller.signal);
    await vi.waitFor(() => expect(io.render).toHaveBeenCalledOnce());
    if (operation === 'abort') controller.abort();
    if (operation === 'dispose') f.owner.dispose();
    expect(f.release).not.toHaveBeenCalled();
    expect(f.frames[0]!.close).not.toHaveBeenCalled();
    fence.resolve();
    if (operation === 'complete') await pending;
    else await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.frames[0]!.close).toHaveBeenCalledOnce();
    f.owner.dispose();
    expect(f.provider.dispose).toHaveBeenCalledOnce();
  }
);

it.each(['gpu', 'legacy'] as const)(
  'allows %s HTML only after provider unsupported',
  async (renderer) => {
    const f = fixture(renderer);
    vi.mocked(f.provider.acquire).mockResolvedValueOnce(null);
    try {
      await f.owner.renderFrameWithPresentation(0, new AbortController().signal);
      expect(f.provider.acquire).toHaveBeenCalledOnce();
      expect(io.render.mock.calls[0]![0].preparedFrame).toBeUndefined();
      expect(io.render.mock.calls[0]![0].videoRefs.current.source).toBeInstanceOf(HTMLVideoElement);
      expect(f.release).not.toHaveBeenCalled();
    } finally {
      f.owner.dispose();
    }
  }
);

it.each(['gpu', 'legacy'] as const)(
  'propagates %s decode failure without HTML capture',
  async (renderer) => {
    const f = fixture(renderer);
    vi.mocked(f.provider.acquire).mockRejectedValueOnce(new Error('decoded source unavailable'));
    try {
      await expect(
        f.owner.renderFrameWithPresentation(0, new AbortController().signal)
      ).rejects.toThrow('decoded source unavailable');
      expect(io.render).not.toHaveBeenCalled();
      expect(document.querySelector('video')).toBeNull();
    } finally {
      f.owner.dispose();
    }
  }
);

it('rejects undefined preparation without an actual unsupported source result', async () => {
  const f = fixture();
  vi.spyOn(framePlan, 'prepareNativePreviewSceneFrame').mockResolvedValueOnce(undefined);
  try {
    await expect(
      f.owner.renderFrameWithPresentation(0, new AbortController().signal)
    ).rejects.toThrow('Preview source preparation is unavailable');
    expect(io.render).not.toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
  } finally {
    f.owner.dispose();
  }
});

it('prepares Standard canonical sources without HTML capture or GPU isolation', async () => {
  const f = fixture('legacy');
  try {
    await f.owner.renderFrameWithPresentation(1.26, new AbortController().signal);
    expect(io.create).toHaveBeenCalledOnce();
    const input = io.render.mock.calls[0]![0];
    expect(input.previewRenderer).toBe('legacy');
    expect(input.gpuPreview).toBeUndefined();
    expect(input.videoRefs.current).toEqual({});
    expect(input.preparedFrame?.sourcePresentation.get('source')?.timestampUs).toBe(1_250_000);
    expect(input.preparedFrame?.gpuIsolated).toBe(false);
    expect(f.release).toHaveBeenCalledOnce();
  } finally {
    f.owner.dispose();
  }
});

it('releases a source lease arriving after materializer disposal before rendering', async () => {
  const f = fixture();
  const acquired = Promise.withResolvers<Awaited<ReturnType<PreviewSourceProvider['acquire']>>>();
  const lateRelease = vi.fn();
  vi.mocked(f.provider.acquire).mockReturnValueOnce(acquired.promise);
  const pending = f.owner.renderFrameWithPresentation(1.26, new AbortController().signal);
  await vi.waitFor(() => expect(f.provider.acquire).toHaveBeenCalledOnce());
  f.owner.dispose();
  expect(f.provider.dispose).toHaveBeenCalledOnce();
  acquired.resolve({ bindings: new Map(), release: lateRelease });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(lateRelease).toHaveBeenCalledOnce();
  expect(io.render).not.toHaveBeenCalled();
  expect(f.frames).toHaveLength(0);
});

it('releases prepared sources after a render failure without replacing them with HTML video', async () => {
  const f = fixture();
  io.render.mockRejectedValueOnce(new Error('GPU render failed'));
  try {
    await expect(
      f.owner.renderFrameWithPresentation(1.26, new AbortController().signal)
    ).rejects.toThrow('GPU render failed');
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.frames[0]!.close).toHaveBeenCalledOnce();
    expect(document.querySelector('video')).toBeNull();
  } finally {
    f.owner.dispose();
  }
});

it('retains one provider and actual asset bindings across supported composition updates', async () => {
  const f = fixture();
  try {
    await f.owner.renderFrameWithPresentation(1.26, new AbortController().signal);
    expect(f.owner.updateProject({ ...f.project, name: 'Changed authored composition' })).toBe(
      true
    );
    await f.owner.renderFrameWithPresentation(1.27, new AbortController().signal);
    expect(io.create).toHaveBeenCalledOnce();
    expect(f.provider.retainSources).toHaveBeenNthCalledWith(2, new Set(['blob:bound-source']));
    expect(f.provider.dispose).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(2);
    expect(f.frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  } finally {
    f.owner.dispose();
  }
  expect(f.provider.dispose).toHaveBeenCalledOnce();
});

it.each(['gpu', 'legacy'] as const)(
  'uses shared ordinary source preparation for a %s playback window',
  async (renderer) => {
    const f = fixture(renderer);
    const clip = f.project.clips[0]!;
    if (clip.type !== 'VIDEO') throw new Error('Expected video');
    clip.playbackWindow = { offset: 0 };
    try {
      await f.owner.renderFrameWithPresentation(1.26, new AbortController().signal);
      expect(f.provider.acquire).toHaveBeenCalledOnce();
      expect(io.render.mock.lastCall![0].preparedFrame?.sourceFrames).toBeDefined();
      expect(f.release).toHaveBeenCalledOnce();
    } finally {
      f.owner.dispose();
    }
  }
);

it('does not replace a real ordinary playback-window source failure with a retained endpoint', async () => {
  const f = fixture();
  const clip = f.project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.playbackWindow = { offset: 0 };
  const failure = new Error('ordinary leading gap is too large');
  vi.mocked(f.provider.acquire).mockRejectedValueOnce(failure);
  try {
    await expect(f.owner.renderFrameWithPresentation(0, new AbortController().signal)).rejects.toBe(
      failure
    );
    expect(io.render).not.toHaveBeenCalled();
  } finally {
    f.owner.dispose();
  }
});
