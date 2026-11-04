import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { createReviewPreviewRenderer } from './render-preview';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createPreviewRenderResources } from './preview-render-resources';
import { resolvePreviewRenderAllocation } from './preview-render-allocation';

const io = vi.hoisted(() => ({
  order: [] as string[],
  frame: vi.fn(),
  cameraPlan: vi.fn(),
  overlays: vi.fn(),
  webcam: vi.fn(),
  keys: vi.fn(),
  blackout: vi.fn(),
  transition: vi.fn(),
  watermark: vi.fn(),
  header: vi.fn(),
  spatial: vi.fn(),
  background: vi.fn(),
  captionPreparation: vi.fn(),
  gpu: vi.fn(),
}));
vi.mock('../../features/video/composition/motion/follow-cursor', async (original) => {
  const actual =
    await original<typeof import('../../features/video/composition/motion/follow-cursor')>();
  return {
    ...actual,
    planWorkingZoneCamera: (...args: Parameters<typeof actual.planWorkingZoneCamera>) => {
      io.cameraPlan();
      return actual.planWorkingZoneCamera(...args);
    },
  };
});
vi.mock('./render-captions', async (original) => {
  const actual = await original<typeof import('./render-captions')>();
  return {
    ...actual,
    prepareReviewCaptions: (...args: Parameters<typeof actual.prepareReviewCaptions>) => {
      io.captionPreparation(...args);
      return actual.prepareReviewCaptions(...args);
    },
  };
});
vi.mock('../../features/video/composition/canvas/gpu-preview', async (original) => ({
  ...(await original<typeof import('../../features/video/composition/canvas/gpu-preview')>()),
  createGpuPreviewRenderer: io.gpu,
}));
vi.mock('./scene-frame', () => ({ drawReviewSceneFrame: io.frame }));
vi.mock('./render-scene-overlays', () => ({ drawReviewSceneOverlays: io.overlays }));
vi.mock('./render-webcam', () => ({ drawReviewWebcam: io.webcam }));
vi.mock('./render-key-animation', () => ({ drawReviewKeys: io.keys }));
vi.mock('./cut-transition-frames', async (original) => ({
  ...(await original<typeof import('./cut-transition-frames')>()),
  paintReviewCutTransition: io.transition,
  paintReviewCutBlackout: io.blackout,
}));
vi.mock('../../features/video/composition/canvas/watermark', () => ({
  createWatermarkRenderer: io.watermark,
  measureWatermark: async (...args: unknown[]) => ({
    cache: null,
    source: null,
    paint: (assets: unknown) => io.watermark(args[0], args[1], assets, args[2], args[3]),
  }),
}));
vi.mock('./window-header', async (original) => ({
  ...(await original<typeof import('./window-header')>()),
  loadReviewWindowHeader: io.header,
  reviewWindowHeaderUrl: () => 'local-header',
}));
vi.mock('../../features/video/composition/canvas/spatial-renderer', () => ({
  createReviewSpatialRenderer: io.spatial,
}));
vi.mock('./scene-background', () => ({ createReviewBackgroundPainter: io.background }));

const size = { width: 1920, height: 1080 };
const dimensions = { canonical: size, backing: { width: 640, height: 360 } };
function scene(): Parameters<ReturnType<typeof createReviewPreviewRenderer>['prepare']>[0] {
  return {
    source: { ...size },
    background: { enabled: false },
    zoomRegions: [],
    comments: [],
    keys: [],
    clicks: [],
  };
}
function frame(): Parameters<ReturnType<typeof createReviewPreviewRenderer>['render']>[1] {
  return {
    generation: 7,
    sourceTime: 1,
    resultTime: 2,
    source: { timestamp: 0.98, backing: dimensions.backing, draw: vi.fn() },
  };
}
function setup() {
  const leases: { release: ReturnType<typeof vi.fn>; context: CanvasRenderingContext2D }[] = [];
  const reservations: ReturnType<typeof vi.fn>[] = [];
  const resources: RenderResources = {
    canvas: vi.fn((_role, bounds) => {
      const context = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        clearRect: vi.fn(),
        scale: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(() => io.order.push('outer-fade')),
        measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(() => io.order.push('captions')),
      } as unknown as CanvasRenderingContext2D;
      const release = vi.fn();
      leases.push({ release, context });
      return { canvas: { ...bounds } as HTMLCanvasElement, context, release };
    }),
    bytes: vi.fn(() => {
      const release = vi.fn();
      reservations.push(release);
      return { release };
    }),
  };
  return { resources, leases, reservations };
}

beforeEach(() => {
  io.order.length = 0;
  io.frame.mockImplementation((_context, request) => {
    io.order.push('scene');
    request.drawOverlays?.(null);
  });
  io.overlays.mockImplementation(() => io.order.push('overlays'));
  io.webcam.mockImplementation(() => io.order.push('webcam'));
  io.keys.mockImplementation(() => io.order.push('keys'));
  io.blackout.mockImplementation(() => io.order.push('blackout'));
  io.transition.mockImplementation(() => io.order.push('transition'));
  io.watermark.mockImplementation(async () => ({
    bounds: { x: 1, y: 1, width: 10, height: 10 },
    draw: () => io.order.push('watermark'),
    dispose: vi.fn(),
  }));
  io.background.mockImplementation(() => ({ draw: vi.fn(), dispose: vi.fn() }));
  io.spatial.mockImplementation(() => ({ dispose: vi.fn() }));
  io.header.mockResolvedValue({ width: 640, height: 30, close: vi.fn() });
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve(), load: vi.fn(async () => [{ status: 'loaded' }]) },
  });
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('does not traverse immutable camera trajectories again for the next preview frame', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  const region = createQuickEditZoomRegion({ id: 'camera-cache', at: 0 });
  const readScale = vi.fn(() => 1.25);
  Object.defineProperty(region.transform, 'scale', { enumerable: true, get: readScale });
  input.zoomRegions = [region];
  const first = await renderer.prepare(input, dimensions, new AbortController().signal);
  const reads = readScale.mock.calls.length;
  expect(reads).toBeGreaterThan(0);
  const next = await renderer.prepare({ ...input }, dimensions, new AbortController().signal);
  expect(next.generation).toBe(first.generation);
  expect(readScale).toHaveBeenCalledTimes(reads);
  renderer.dispose();
});

it('prepares follow-camera plans before playback reaches an effect', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const region = createQuickEditZoomRegion({ id: 'later-follow', at: 5, duration: 3 });
  region.cursorFocus = {
    scene: { source: size, background: { enabled: false } },
    path: {
      version: 1,
      mode: 'follow',
      smoothing: 0.5,
      sensitivity: 0.5,
      gapPolicy: 'hold',
      segments: [
        {
          id: 'path',
          binding: { kind: 'project' },
          start: 0,
          end: 10,
          keys: [{ id: 'point', time: 0, x: 0.5, y: 0.5, anchor: 'manual', interpolation: 'hold' }],
        },
      ],
    },
  };
  const input = { ...scene(), zoomRegions: [region] };
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  expect(region.perspective).toBeUndefined();
  expect(region.cursorComposition?.mode).toBe('orbit');
  expect(io.spatial).toHaveBeenCalledOnce();
  expect(io.cameraPlan).toHaveBeenCalled();
  const count = io.cameraPlan.mock.calls.length;
  (await renderer.render(prepared, { ...frame(), resultTime: 6 })).release();
  expect(io.cameraPlan).toHaveBeenCalledTimes(count);
  renderer.dispose();
});

it('awaits captured source normalization before composing the publication', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const prepared = await renderer.prepare(scene(), dimensions, new AbortController().signal);
  const captured = frame();
  const prepare = vi.fn(async () => {
    io.order.push('source-ready');
  });
  captured.source.prepare = prepare;
  io.frame.mockImplementationOnce(() => {
    expect(io.order).toContain('source-ready');
  });
  const completed = await renderer.render(prepared, captured);
  expect(prepare).toHaveBeenCalledOnce();
  completed.release();
  prepared.release();
  renderer.dispose();
});

it('composes video, 3D, depth and temporal exposure on GPU before source normalization', async () => {
  vi.stubGlobal('navigator', { gpu: {} });
  const bitmap = { close: vi.fn() };
  const gpuRender = vi.fn(async () => bitmap);
  io.gpu.mockResolvedValue({ render: gpuRender, dispose: vi.fn(), allocatedBytes: 0 });
  const { resources, leases } = setup();
  const owner = createReviewPreviewRenderer({ resources });
  const region = createQuickEditZoomRegion({ id: 'gpu-camera', at: 0, duration: 4 });
  region.transform.scale = 1.5;
  region.enter.duration = 2;
  region.motionBlur = { enter: { enabled: true, strength: 1 } };
  region.perspective = { enabled: true, rotateX: 0.1, rotateY: 0.3, rotateZ: 0, strength: 0.5 };
  region.depthOfField = {
    enabled: true,
    mode: 'depth',
    x: 0.5,
    y: 0.5,
    width: 0.2,
    softness: 0.3,
    strength: 0.5,
  };
  const prepared = await owner.prepare(
    { ...scene(), zoomRegions: [region] },
    dimensions,
    new AbortController().signal
  );
  const raw = { timestamp: 1_000_000, close: vi.fn(), copyTo: vi.fn() } as unknown as VideoFrame;
  const prepare = vi.fn();
  const source = {
    timestamp: 1,
    backing: dimensions.backing,
    draw: vi.fn(),
    videoFrame: () => raw,
    prepare,
  };
  const result = await owner.render(prepared, { ...frame(), source, sourceTime: 1, resultTime: 1 });
  expect(gpuRender).toHaveBeenCalledOnce();
  expect(prepare).not.toHaveBeenCalled();
  expect(source.draw).not.toHaveBeenCalled();
  expect(raw.copyTo).not.toHaveBeenCalled();
  expect(raw.close).not.toHaveBeenCalled();
  expect(io.frame).not.toHaveBeenCalled();
  expect(io.spatial).not.toHaveBeenCalled();
  expect(result.geometry?.resultTime).toBe(1);
  expect(result.geometry?.generation).toBe(frame().generation);
  expect(result.geometry?.sceneGeneration).toBe(prepared.generation);
  expect(bitmap.close).toHaveBeenCalledOnce();
  result.release();
  prepared.release();
  owner.dispose();
  expect(leases.every((lease) => lease.release.mock.calls.length === 1)).toBe(true);
});

it.each(['no-adapter', 'device-failure'] as const)(
  'lazily restores the complete spatial Canvas backend after GPU %s',
  async (failure) => {
    vi.stubGlobal('navigator', { gpu: {} });
    const { GpuPreviewDeviceError } =
      await import('../../features/video/composition/canvas/gpu-preview');
    io.gpu.mockResolvedValue(
      failure === 'no-adapter'
        ? null
        : {
            render: vi.fn(async () => {
              throw new GpuPreviewDeviceError('Device lost');
            }),
            dispose: vi.fn(),
            allocatedBytes: 0,
          }
    );
    const { resources } = setup();
    const owner = createReviewPreviewRenderer({ resources });
    const region = createQuickEditZoomRegion({ id: 'fallback-camera', at: 0, duration: 4 });
    region.perspective = { enabled: true, rotateX: 0.1, rotateY: 0.3, rotateZ: 0, strength: 0.5 };
    const prepared = await owner.prepare(
      { ...scene(), zoomRegions: [region] },
      dimensions,
      new AbortController().signal
    );
    expect(io.spatial).not.toHaveBeenCalled();
    const raw = { timestamp: 2_000_000, close: vi.fn() } as unknown as VideoFrame;
    const prepare = vi.fn();
    const source = {
      timestamp: 2,
      backing: dimensions.backing,
      draw: vi.fn(),
      prepare,
      videoFrame: () => raw,
    };
    io.frame.mockImplementationOnce((_context, request) => {
      expect(request.spatialRenderer).toBeDefined();
      expect(request.layout.spatial).toBeDefined();
    });
    const result = await owner.render(prepared, {
      ...frame(),
      source,
      sourceTime: 2,
      resultTime: 2,
    });
    expect(io.spatial).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    expect(io.frame).toHaveBeenCalledOnce();
    expect(raw.close).not.toHaveBeenCalled();
    expect(result.geometry).toBeNull();
    result.release();
    prepared.release();
    owner.dispose();
  }
);

it('admits export frames without an unrelated WebGPU allocation allowance', async () => {
  vi.stubGlobal('navigator', { gpu: {} });
  const { resolvePreviewRenderAllocation, calculatePreviewRenderAllocation } =
    await import('./preview-render-allocation');
  const { resources } = setup();
  const sourceScene = scene();
  const graph = resolvePreviewRenderAllocation({
    scene: sourceScene,
    dimensions,
    resultTime: 0,
    sourceTime: 0,
    sourceAllocationBytes: null,
    sourceBacking: size,
    camera: { retainedBytes: null, activeBytes: null },
    transitionBytes: null,
    previousFront: null,
    assets: {
      headerBitmap: null,
      backgroundBitmap: null,
      watermark: null,
      previousWatermarkCache: null,
    },
  });
  const replaceLimits = vi.fn();
  const enhancement = {
    mode: 'bicubic-sharpen' as const,
    withEnhancedRegion: vi.fn(),
    dispose: vi.fn(),
  };
  const owner = createReviewPreviewRenderer({
    resources,
    exportEnhancer: enhancement,
    allocation: { describe: () => graph, replaceLimits },
  });
  const prepared = await owner.prepare(sourceScene, dimensions, new AbortController().signal);
  owner.admit(prepared, { ...frame(), exportEnhancer: enhancement });
  const expected = calculatePreviewRenderAllocation(graph);
  expect(replaceLimits.mock.calls.at(-1)![0]).toEqual({
    maximumManagedBytes: expected.maximumManagedBytes,
    maximumCanvases: expected.maximumCanvases,
  });
  expect(io.gpu).not.toHaveBeenCalled();
  prepared.release();
  owner.dispose();
});

it('honors Standard without acquiring the available GPU backend', async () => {
  vi.stubGlobal('navigator', { gpu: {} });
  io.gpu.mockResolvedValue({
    render: vi.fn(async () => ({ close: vi.fn() })),
    dispose: vi.fn(),
    allocatedBytes: 0,
  });
  const { resources } = setup();
  const owner = createReviewPreviewRenderer({ resources, renderer: 'legacy' });
  const prepared = await owner.prepare(scene(), dimensions, new AbortController().signal);
  const raw = { timestamp: 1_000_000, close: vi.fn() } as unknown as VideoFrame;
  const result = await owner.render(prepared, {
    ...frame(),
    source: { ...frame().source, videoFrame: () => raw },
  });
  expect(io.gpu).not.toHaveBeenCalled();
  expect(io.frame).toHaveBeenCalled();
  result.release();
  prepared.release();
  owner.dispose();
  expect(raw.close).not.toHaveBeenCalled();
});

it('keeps the GPU device across prepared scene and backing replacements', async () => {
  vi.stubGlobal('navigator', { gpu: {} });
  const bitmap = { close: vi.fn() };
  const gpuRender = vi.fn(async () => bitmap);
  const dispose = vi.fn();
  io.gpu.mockResolvedValue({ render: gpuRender, dispose, allocatedBytes: 0 });
  const { resources, leases } = setup();
  const owner = createReviewPreviewRenderer({ resources });
  const raw = { timestamp: 1_000_000, close: vi.fn() } as unknown as VideoFrame;
  for (const backing of [dimensions.backing, { width: 600, height: 338 }, dimensions.backing]) {
    const prepared = await owner.prepare(
      scene(),
      { ...dimensions, backing },
      new AbortController().signal
    );
    const source = { ...frame().source, videoFrame: () => raw, backing };
    const result = await owner.render(prepared, { ...frame(), source });
    result.release();
    prepared.release();
  }
  expect(gpuRender).toHaveBeenCalledTimes(3);
  expect(io.gpu).toHaveBeenCalledOnce();
  expect(dispose).not.toHaveBeenCalled();
  owner.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(raw.close).not.toHaveBeenCalled();
  expect(leases.every((lease) => lease.release.mock.calls.length === 1)).toBe(true);
});

it('admits retained GPU allocations while preparing the next scene', async () => {
  vi.stubGlobal('navigator', { gpu: {} });
  const f = setup();
  const resources = createPreviewRenderResources({
    maximumManagedBytes: 1,
    maximumCanvases: 1,
    createCanvas: () => {
      const lease = f.resources.canvas('test', { width: 1, height: 1 });
      return Object.assign(lease.canvas, { getContext: () => lease.context });
    },
  });
  const input = scene();
  const graph = resolvePreviewRenderAllocation({
    scene: input,
    dimensions,
    resultTime: 1,
    sourceTime: 1,
    sourceAllocationBytes: null,
    sourceBacking: size,
    camera: { retainedBytes: null, activeBytes: null },
    transitionBytes: null,
    previousFront: null,
    assets: {
      backgroundBitmap: null,
      headerBitmap: null,
      watermark: null,
      previousWatermarkCache: null,
    },
  });
  const retainedBytes = 4 * 1024 * 1024;
  let retained: { release(): void } | null = null;
  io.gpu.mockResolvedValue({
    get allocatedBytes() {
      return retained ? retainedBytes : 0;
    },
    render: vi.fn(async () => {
      retained ??= resources.bytes('test-gpu-texture', retainedBytes);
      return { close: vi.fn() };
    }),
    dispose: () => {
      retained?.release();
      retained = null;
    },
  });
  const owner = createReviewPreviewRenderer({
    resources,
    allocation: { describe: () => graph, replaceLimits: (next) => resources.replaceLimits(next) },
  });
  const first = await owner.prepare(input, dimensions, new AbortController().signal);
  const source = {
    ...frame().source,
    videoFrame: () => ({ timestamp: 1_000_000 }) as VideoFrame,
  };
  (await owner.render(first, { ...frame(), source })).release();
  first.release();
  const next = await owner.prepare(
    input,
    { ...dimensions, backing: { width: 600, height: 338 } },
    new AbortController().signal
  );
  expect(io.gpu).toHaveBeenCalledOnce();
  next.release();
  owner.dispose();
  expect(retained).toBeNull();
  resources.dispose();
  expect(resources.counters.managedBytes).toBe(0);
});
