// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createImageClip } from '../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
import type {
  GpuPreviewLayer,
  GpuPreviewRenderer,
} from '../../../features/video/composition/canvas/gpu-preview';
import type { GpuPreviewTargetFactory } from '../../../features/video/composition/canvas/preview-presentation';
import type { PreviewSceneRenderInput, PreviewScenePresentation } from '../stage/scene/types';
import { createGpuPreviewRenderer } from '../../../features/video/composition/canvas/gpu-preview';
import { renderPreviewScene } from '../stage/scene/render-preview';
import { createVideoPreviewFrameMaterializer } from './materializer';

vi.mock('../../../features/video/composition/canvas/gpu-preview', async (original) => ({
  ...(await original<typeof import('../../../features/video/composition/canvas/gpu-preview')>()),
  createGpuPreviewRenderer: vi.fn(),
}));
vi.mock('../stage/scene/gpu-preview', () => ({
  createNativeGpuPreviewRenderer: () => ({ acceptsNativeFrames: true, dispose: vi.fn() }),
}));
vi.mock('../stage/scene/render-preview', () => ({ renderPreviewScene: vi.fn() }));
vi.mock('../../../workflows/video-review/decoded-video-sample', () => ({
  createCompositionCutSampleSource: () => ({
    sample: async () => ({ media: new Map(), release() {} }),
    dispose() {},
  }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  document.body.replaceChildren();
});

function fixture(type: 'dissolve' | 'fade-black' = 'dissolve', sampling?: 'cut') {
  const project = createEmptyVideoProject('GPU joins');
  project.fps = 4;
  project.duration = 2;
  project.clips = [createImageClip({ id: 'intro', trackId: project.tracks[0]!.id, duration: 1 })];
  project.compositionJoins = [
    {
      id: 'join',
      clipId: 'intro',
      edge: 'end',
      ...(sampling ? { sampling } : {}),
      transition: { type, before: 0.5, after: 0.5, color: '#ffffff' },
    },
  ];
  const sources: {
    canvas: HTMLCanvasElement;
    releaseImage: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[] = [];
  const nativeRenderer: GpuPreviewRenderer = {
    allocatedBytes: 0,
    render: vi.fn(),
    dispose: vi.fn(),
    createSurface: vi.fn((canvas) => {
      const surface = {
        canvas,
        present: vi.fn(async () => {}),
        releaseImage: vi.fn(),
        dispose: vi.fn(),
      };
      sources.push(surface);
      return surface;
    }),
  };
  const nestedSources: {
    canvas: HTMLCanvasElement;
    present: ReturnType<typeof vi.fn>;
    releaseImage: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[] = [];
  const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  const finalRenderer: GpuPreviewRenderer = {
    allocatedBytes: 0,
    render: vi.fn(async () => bitmap),
    dispose: vi.fn(),
    createSurface: vi.fn((canvas) => {
      const surface = {
        canvas,
        present: vi.fn(async (_request: Parameters<GpuPreviewRenderer['render']>[0]) => {}),
        releaseImage: vi.fn(),
        dispose: vi.fn(),
      };
      nestedSources.push(surface);
      return surface;
    }),
  };
  vi.mocked(createGpuPreviewRenderer).mockResolvedValue(finalRenderer);
  vi.mocked(renderPreviewScene).mockImplementation(
    async (input: PreviewSceneRenderInput): Promise<PreviewScenePresentation> => {
      const camera =
        input.cameraOverride ??
        resolveVideoCompositionFrame(input.project, input.currentTime).camera;
      if (!input.acquireGpuOutput)
        return { camera, time: input.currentTime, renderer: { backend: 'gpu' } };
      const target = input.acquireGpuOutput({ width: 8, height: 4 }, nativeRenderer);
      await target.surface.present({
        output: { width: 8, height: 4 },
        logical: { width: 8, height: 4 },
        layers: [],
        signal: input.signal!,
      });
      return {
        camera,
        time: input.currentTime,
        renderer: { backend: 'gpu' },
        output: { canvas: target.canvas, release: target.release },
      };
    }
  );
  const present = vi.fn(async (_request: Parameters<GpuPreviewRenderer['render']>[0]) => {});
  const release = vi.fn();
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = 8;
  finalCanvas.height = 4;
  const acquire = vi.fn<GpuPreviewTargetFactory>(() => ({
    canvas: finalCanvas,
    surface: { canvas: finalCanvas, present, dispose: vi.fn() },
    release,
  }));
  const draw = vi.spyOn(Object.getPrototypeOf(finalCanvas.getContext('2d')!), 'drawImage');
  const owner = createVideoPreviewFrameMaterializer({
    assetUrls: {},
    ownerDocument: document,
    project,
    rasterSize: { width: 8, height: 4 },
  });
  return {
    project,
    owner,
    sources,
    nestedSources,
    nativeRenderer,
    finalRenderer,
    finalCanvas,
    acquire,
    present,
    release,
    draw,
  };
}
function groupLayers(layers: readonly GpuPreviewLayer[]) {
  const group = layers.find(
    (layer) => 'kind' in layer.source && layer.source.kind === 'group'
  )?.source;
  if (!group || !('kind' in group)) throw new Error('Missing GPU endpoint group');
  return group.layers;
}

it('hands off final GPU output and reuses private endpoints across blend weights', async () => {
  const f = fixture();
  try {
    const first = await f.owner.renderFrameWithPresentation(
      1,
      new AbortController().signal,
      undefined,
      f.acquire
    );
    expect(first.canvas).toBe(f.finalCanvas);
    expect(first.presentation.output?.canvas).toBe(f.finalCanvas);
    expect(first.presentation.time).toBe(1);
    expect(first.presentation.camera).toEqual(resolveVideoCompositionFrame(f.project, 1).camera);
    expect(f.acquire).toHaveBeenCalledOnce();
    expect(f.sources).toHaveLength(2);
    expect(vi.mocked(renderPreviewScene).mock.calls.map(([input]) => input.currentTime)).toEqual([
      0.75, 1,
    ]);
    expect(
      vi
        .mocked(renderPreviewScene)
        .mock.calls.every(
          ([input]) => input.acquireGpuOutput !== f.acquire && input.sceneEdges === 'omit'
        )
    ).toBe(true);
    const layers = groupLayers(f.present.mock.calls[0]![0].layers);
    expect(layers.map(({ source, opacity, blend }) => ({ source, opacity, blend }))).toEqual([
      { source: f.sources[0]!.canvas, opacity: 0.5, blend: undefined },
      { source: f.sources[1]!.canvas, opacity: 0.5, blend: 'add' },
    ]);
    first.presentation.output?.release();
    const next = await f.owner.renderFrameWithPresentation(
      1.1,
      new AbortController().signal,
      undefined,
      f.acquire
    );
    expect(renderPreviewScene).toHaveBeenCalledTimes(2);
    const nextLayers = groupLayers(f.present.mock.calls[1]![0].layers);
    expect(nextLayers[0]!.source).toBe(layers[0]!.source);
    expect(nextLayers[1]!.opacity).toBeCloseTo(0.6);
    expect(f.sources.every((source) => source.releaseImage.mock.calls.length === 0)).toBe(true);
    expect(f.draw).not.toHaveBeenCalled();
    next.presentation.output?.release();
  } finally {
    f.owner.dispose();
  }
  expect(f.sources.every((source) => source.releaseImage.mock.calls.length === 1)).toBe(true);
});

it('preserves exact moving-cut clocks and camera while using source-over group semantics', async () => {
  const f = fixture('dissolve', 'cut');
  const camera = { ...resolveVideoCompositionFrame(f.project, 0.85).camera, viewportX: 0.125 };
  try {
    const frame = await f.owner.renderFrameWithPresentation(
      0.85,
      new AbortController().signal,
      camera,
      f.acquire
    );
    expect(vi.mocked(renderPreviewScene).mock.calls.map(([input]) => input.currentTime)).toEqual([
      0.85, 1,
    ]);
    expect(
      vi.mocked(renderPreviewScene).mock.calls.every(([input]) => input.cameraOverride === camera)
    ).toBe(true);
    expect(frame.presentation.camera).toBe(camera);
    expect(frame.presentation.time).toBe(0.85);
    const layers = groupLayers(f.present.mock.calls[0]![0].layers);
    expect(layers[0]!.opacity).toBe(1);
    expect(layers[1]!.opacity).toBeCloseTo(0.35);
    expect(layers[1]!.blend).toBe('over');
    expect(f.draw).not.toHaveBeenCalled();
    frame.presentation.output?.release();
  } finally {
    f.owner.dispose();
  }
});

it.each(['abort', 'dispose'] as const)(
  'pins the retained pair through the final GPU fence after %s',
  async (reason) => {
    const f = fixture();
    const fence = Promise.withResolvers<void>();
    f.present.mockReturnValueOnce(fence.promise);
    const controller = new AbortController();
    const run = f.owner.renderFrameWithPresentation(1, controller.signal, undefined, f.acquire);
    const rejected = expect(run).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(f.present).toHaveBeenCalledOnce());
    if (reason === 'abort') controller.abort();
    else f.owner.dispose();
    expect(f.sources).toHaveLength(2);
    expect(f.sources.every((source) => source.releaseImage.mock.calls.length === 0)).toBe(true);
    expect(f.release).not.toHaveBeenCalled();
    fence.resolve();
    await rejected;
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.sources.every((source) => source.releaseImage.mock.calls.length === 1)).toBe(true);
    expect(f.draw).not.toHaveBeenCalled();
    f.owner.dispose();
  }
);

it('retains the current color-join source through final completion and applies color with GPU opacity', async () => {
  const f = fixture('fade-black');
  const fence = Promise.withResolvers<void>();
  f.present.mockReturnValueOnce(fence.promise);
  try {
    const run = f.owner.renderFrameWithPresentation(
      1.25,
      new AbortController().signal,
      undefined,
      f.acquire
    );
    await vi.waitFor(() => expect(f.present).toHaveBeenCalledOnce());
    expect(vi.mocked(renderPreviewScene).mock.calls.map(([input]) => input.currentTime)).toEqual([
      1.25,
    ]);
    expect(f.sources).toHaveLength(1);
    expect(f.sources[0]!.releaseImage).not.toHaveBeenCalled();
    const layers = f.present.mock.calls[0]![0].layers;
    expect(layers[0]!.source).toBe(f.sources[0]!.canvas);
    const artwork = layers[1]!;
    expect(artwork.opacity).toBeCloseTo(0.5);
    expect(artwork.source).toBeInstanceOf(HTMLCanvasElement);
    if (!(artwork.source instanceof HTMLCanvasElement))
      throw new Error('Missing solid color source');
    expect([artwork.source.width, artwork.source.height]).toEqual([1, 1]);
    expect(Array.from(artwork.source.getContext('2d')!.getImageData(0, 0, 1, 1).data)).toEqual([
      255, 255, 255, 255,
    ]);
    fence.resolve();
    const frame = await run;
    expect(f.sources[0]!.releaseImage).toHaveBeenCalledOnce();
    expect(f.release).not.toHaveBeenCalled();
    expect(f.draw).not.toHaveBeenCalled();
    frame.presentation.output?.release();
  } finally {
    fence.resolve();
    f.owner.dispose();
  }
});

it('retires cached endpoints after source and camera edits before preparing a new immutable pair', async () => {
  const f = fixture();
  try {
    const signal = new AbortController().signal;
    const first = await f.owner.renderFrameWithPresentation(1, signal, undefined, f.acquire);
    first.presentation.output?.release();
    const changed = {
      ...f.project,
      clips: f.project.clips.map((clip) =>
        'transform' in clip
          ? { ...clip, transform: { ...clip.transform, x: clip.transform.x + 0.1 } }
          : clip
      ),
    };
    expect(f.owner.updateProject(changed)).toBe(true);
    expect(f.sources.every((source) => source.releaseImage.mock.calls.length === 1)).toBe(true);
    const second = await f.owner.renderFrameWithPresentation(1, signal, undefined, f.acquire);
    second.presentation.output?.release();
    expect(renderPreviewScene).toHaveBeenCalledTimes(4);
    const camera = { ...resolveVideoCompositionFrame(changed, 1).camera, viewportX: 0.25 };
    const third = await f.owner.renderFrameWithPresentation(1, signal, camera, f.acquire);
    third.presentation.output?.release();
    expect(renderPreviewScene).toHaveBeenCalledTimes(6);
    expect(third.presentation.camera).toBe(camera);
    expect(f.draw).not.toHaveBeenCalled();
  } finally {
    f.owner.dispose();
  }
});

it.each([1, 2])(
  'cleans up a failure in sample %i and permits a complete retry',
  async (failedSample) => {
    const f = fixture();
    const scene = vi.mocked(renderPreviewScene).getMockImplementation()!;
    if (failedSample === 2) vi.mocked(renderPreviewScene).mockImplementationOnce(scene);
    vi.mocked(renderPreviewScene).mockRejectedValueOnce(new Error('sample failed'));
    try {
      const signal = new AbortController().signal;
      await expect(
        f.owner.renderFrameWithPresentation(1, signal, undefined, f.acquire)
      ).rejects.toThrow('sample failed');
      expect(f.acquire).not.toHaveBeenCalled();
      expect(f.sources.every((source) => source.releaseImage.mock.calls.length === 1)).toBe(true);
      const frame = await f.owner.renderFrameWithPresentation(1, signal, undefined, f.acquire);
      expect(frame.canvas).toBe(f.finalCanvas);
      expect(renderPreviewScene).toHaveBeenCalledTimes(failedSample + 2);
      expect(f.present).toHaveBeenCalledOnce();
      expect(f.draw).not.toHaveBeenCalled();
      frame.presentation.output?.release();
    } finally {
      f.owner.dispose();
    }
  }
);

it('adds the outer scene fade once as GPU artwork after the complete endpoint group', async () => {
  const f = fixture();
  f.project.sceneEdges = {
    intro: { enabled: true, duration: 2 },
    outro: { enabled: false, duration: 0.4 },
  };
  try {
    const frame = await f.owner.renderFrameWithPresentation(
      1,
      new AbortController().signal,
      undefined,
      f.acquire
    );
    const layers = f.present.mock.calls[0]![0].layers;
    expect(groupLayers(layers)).toHaveLength(2);
    expect(layers).toHaveLength(2);
    expect(layers[1]!.opacity).toBeCloseTo(1 - 1 / 1.75);
    expect(
      vi.mocked(renderPreviewScene).mock.calls.every(([input]) => input.sceneEdges === 'omit')
    ).toBe(true);
    expect(f.draw).not.toHaveBeenCalled();
    frame.presentation.output?.release();
  } finally {
    f.owner.dispose();
  }
});

it('retains a nested cut as a private GPU endpoint with one final frontend acquisition', async () => {
  const f = fixture();
  const base = createImageClip({ trackId: f.project.tracks[0]!.id });
  const project = {
    ...f.project,
    fps: 10,
    duration: 3,
    clips: [
      { ...base, id: 'intro', startTime: 0, duration: 1 },
      { ...base, id: 'left', startTime: 1, duration: 0.9 },
      { ...base, id: 'right', startTime: 1.9, duration: 0.1 },
      { ...base, id: 'outro', startTime: 2, duration: 1 },
    ],
    compositionJoins: [
      {
        id: 'intro',
        clipId: 'intro',
        edge: 'end' as const,
        transition: { type: 'dissolve' as const, before: 0.2, after: 0.3 },
      },
      {
        id: 'cut',
        clipId: 'right',
        edge: 'start' as const,
        sampling: 'cut' as const,
        transition: { type: 'dissolve' as const, before: 0.2, after: 0.1 },
      },
      {
        id: 'outro',
        clipId: 'outro',
        edge: 'start' as const,
        transition: { type: 'dissolve' as const, before: 0.3, after: 0.2 },
      },
    ],
  };
  // A different clip inventory requires a new materializer owner.
  f.owner.dispose();
  const owner = createVideoPreviewFrameMaterializer({
    assetUrls: {},
    ownerDocument: document,
    project,
    rasterSize: { width: 8, height: 4 },
  });
  try {
    const frame = await owner.renderFrameWithPresentation(
      2,
      new AbortController().signal,
      undefined,
      f.acquire
    );
    expect(f.acquire).toHaveBeenCalledOnce();
    expect(f.present).toHaveBeenCalledOnce();
    expect(f.nestedSources).toHaveLength(1);
    const inner = groupLayers(f.nestedSources[0]!.present.mock.calls[0]![0].layers);
    expect(inner[0]!.opacity).toBe(1);
    expect(inner[1]!.blend).toBe('over');
    const outer = groupLayers(f.present.mock.calls[0]![0].layers);
    expect(outer[0]!.source).toBe(f.nestedSources[0]!.canvas);
    expect(outer[1]!.blend).toBe('add');
    expect(f.nestedSources[0]!.releaseImage).not.toHaveBeenCalled();
    expect(f.draw).not.toHaveBeenCalled();
    frame.presentation.output?.release();
    const outside = await owner.renderFrameWithPresentation(
      0.1,
      new AbortController().signal,
      undefined,
      f.acquire
    );
    outside.presentation.output?.release();
    expect(f.nestedSources[0]!.dispose).toHaveBeenCalledOnce();
  } finally {
    owner.dispose();
  }
  expect(f.nestedSources[0]!.releaseImage).toHaveBeenCalledOnce();
  expect(f.sources.every((source) => source.releaseImage.mock.calls.length === 1)).toBe(true);
});
