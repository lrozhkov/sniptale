import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { createNewWorkspacePresentationSettings } from '../../features/video/review/advanced/presentation';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { createReviewPreviewRenderer } from './render-preview';
import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { reviewCutTransitionAt } from '../../features/video/review/cuts';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

const io = vi.hoisted(() => ({
  order: [] as string[],
  frame: vi.fn(),
  overlays: vi.fn(),
  webcam: vi.fn(),
  keys: vi.fn(),
  blackout: vi.fn(),
  transition: vi.fn(),
  watermark: vi.fn(),
  header: vi.fn(),
  spatial: vi.fn(),
  background: vi.fn(),
}));
vi.mock('./scene-frame', () => ({ drawReviewSceneFrame: io.frame }));
vi.mock('./render-scene-overlays', () => ({ drawReviewSceneOverlays: io.overlays }));
vi.mock('./render-webcam', () => ({ drawReviewWebcam: io.webcam }));
vi.mock('./render-key-animation', () => ({ drawReviewKeys: io.keys }));
vi.mock('./cut-transition-frames', () => ({
  paintReviewCutTransition: io.transition,
  paintReviewCutBlackout: io.blackout,
}));
vi.mock('./render-watermark', () => ({
  createReviewWatermarkRenderer: io.watermark,
  measureReviewWatermark: async (...args: unknown[]) => ({
    cache: null,
    source: null,
    paint: (readAsset: unknown) => io.watermark(args[0], args[1], args[2], readAsset, args[3]),
  }),
}));
vi.mock('./window-header', () => ({
  loadReviewWindowHeader: io.header,
  reviewWindowHeaderUrl: () => 'local-header',
}));
vi.mock('./spatial-renderer', () => ({ createReviewSpatialRenderer: io.spatial }));
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
        scale: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(() => io.order.push('outer-fade')),
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
  io.frame.mockImplementation(() => io.order.push('scene'));
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
  vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('composes synchronously in layer order from frozen settings and reports actual source time', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  input.source.width = 100;
  const output = renderer.render(prepared, frame());
  expect(output).not.toBeInstanceOf(Promise);
  expect(io.order).toEqual(['scene', 'overlays', 'keys', 'watermark', 'blackout']);
  expect(output).toMatchObject({
    generation: 7,
    sourceTime: 1,
    resultTime: 2,
    representedMediaTime: 0.98,
  });
  expect(io.frame.mock.calls[0]![1]).toMatchObject({
    canvas: dimensions.backing,
    commentSpace: { canvas: dimensions.canonical },
    sourceTime: 1,
    resources,
  });
  expect(leases[0]!.context.scale).toHaveBeenCalledWith(1 / 3, 1 / 3);
  expect(io.keys.mock.calls[0]![3]).toEqual(dimensions.canonical);
  renderer.dispose();
  expect(leases[0]!.release).not.toHaveBeenCalled();
  output.release();
  expect(leases[0]!.release).toHaveBeenCalledOnce();
});

it('passes the same authored layout inputs at both qualities and scales paint values once', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  input.source = { width: 1920, height: 1080 };
  input.background = {
    enabled: true,
    type: 'solid',
    color: '#ffffff',
    layout: { padding: 60, cornerRadius: 30, blur: 12 },
  };
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  renderer.render(prepared, frame()).release();
  const args = io.frame.mock.calls[0]![1];
  expect(args.background.layout).toMatchObject({ padding: 60, cornerRadius: 10, blur: 4 });
  expect(args.sceneScale).toBe(1 / 3);
  expect(args.commentSpace.background.layout).toMatchObject({ cornerRadius: 30, blur: 12 });
  expect(args.layout.videoRect.width * 3).toBeCloseTo(args.commentSpace.layout.videoRect.width);
  renderer.dispose();
});

it('cancels a request lease without destroying the reusable background session cache', async () => {
  const { resources, reservations } = setup();
  const bitmap = { width: 2000, height: 1000, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
  });
  const input = scene();
  input.background = {
    enabled: true,
    type: 'image',
    assetId: 'logo',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  const controller = new AbortController();
  const prepared = await renderer.prepare(input, dimensions, controller.signal);
  expect(resources.bytes).toHaveBeenCalledWith('preview-background-bitmap', 8_000_000);
  controller.abort();
  expect(bitmap.close).not.toHaveBeenCalled();
  expect(reservations[0]).not.toHaveBeenCalled();
  expect(() => renderer.render(prepared, frame())).toThrow('stale');
  const next = await renderer.prepare(input, dimensions, new AbortController().signal);
  expect(createImageBitmap).toHaveBeenCalledOnce();
  renderer.render(next, frame()).release();
  next.release();
  renderer.dispose();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(reservations[0]).toHaveBeenCalledOnce();
});

it('rejects superseded preparation and closes its late decoded bitmap', async () => {
  const { resources } = setup();
  let finish!: (bitmap: ImageBitmap) => void;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(
      () =>
        new Promise<ImageBitmap>((resolve) => {
          finish = resolve;
        })
    )
  );
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
  });
  const input = scene();
  input.background = {
    enabled: true,
    type: 'image',
    assetId: 'logo',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  const pending = renderer.prepare(input, dimensions, new AbortController().signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  const current = await renderer.prepare(scene(), dimensions, new AbortController().signal);
  const bitmap = { width: 10, height: 10, close: vi.fn() };
  finish(bitmap as unknown as ImageBitmap);
  await rejected;
  expect(bitmap.close).toHaveBeenCalledOnce();
  renderer.render(current, frame()).release();
  renderer.dispose();
});

it('releases staging when a layer fails and permits an explicit render retry', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const prepared = await renderer.prepare(scene(), dimensions, new AbortController().signal);
  io.overlays.mockImplementationOnce(() => {
    throw new Error('draw failed');
  });
  expect(() => renderer.render(prepared, frame())).toThrow('draw failed');
  expect(leases[0]!.release).toHaveBeenCalledOnce();
  renderer.render(prepared, frame()).release();
  expect(leases[1]!.release).toHaveBeenCalledOnce();
  renderer.dispose();
});

it('reuses one spatial renderer over admitted frames and releases it when preparation changes', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  input.zoomRegions = [
    {
      ...createQuickEditZoomRegion({ id: 'z', at: 0, duration: 3, endMax: 3 }),
      perspective: { enabled: true, rotateX: 10, rotateY: 20, rotateZ: 0, strength: 0.5 },
    },
  ];
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  renderer.render(prepared, frame()).release();
  renderer.render(prepared, frame()).release();
  expect(io.spatial).toHaveBeenCalledOnce();
  const spatial = io.spatial.mock.results[0]!.value;
  await renderer.prepare(scene(), dimensions, new AbortController().signal);
  expect(spatial.dispose).toHaveBeenCalledOnce();
  expect(() => renderer.render(prepared, frame())).toThrow('stale');
  renderer.dispose();
});

it('reuses scene preparation across request leases and rejects a released lease', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  const first = await renderer.prepare(input, dimensions, new AbortController().signal);
  renderer.render(first, frame()).release();
  first.release();
  expect(() => renderer.render(first, frame())).toThrow('stale');
  const next = await renderer.prepare(
    structuredClone(input),
    structuredClone(dimensions),
    new AbortController().signal
  );
  expect(io.watermark).toHaveBeenCalledOnce();
  expect(io.background).toHaveBeenCalledOnce();
  expect(next.generation).toBe(first.generation);
  renderer.render(next, frame()).release();
  next.release();
  renderer.dispose();
});

it('uses admitted transition endpoints and webcam pixels before the final scene blackout', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  input.webcam = createQuickEditWebcam('camera', { width: 640, height: 480 }, size);
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  const admitted = frame();
  const blend = reviewCutTransitionAt(2, [
    {
      id: 'cut',
      type: 'fade-black',
      seam: 2,
      before: 0.5,
      after: 0.5,
      left: { start: 0, end: 1 },
      right: { start: 3, end: 5 },
    },
  ])!;
  const endpoint = { timestamp: 0.99, draw: vi.fn(), close: vi.fn() };
  admitted.transition = { blend, frames: { left: endpoint, right: { ...endpoint, timestamp: 3 } } };
  admitted.camera = {
    representedMediaTime: 0.96,
    generation: 12,
    source: { width: 640, height: 480 },
    placement: input.webcam.placement,
    drawable: { draw: vi.fn() },
  };
  const output = renderer.render(prepared, admitted);
  expect(io.order).toEqual([
    'transition',
    'scene',
    'overlays',
    'webcam',
    'keys',
    'watermark',
    'blackout',
  ]);
  expect(io.transition.mock.calls[0]!.slice(2)).toEqual([
    blend,
    admitted.transition.frames,
    admitted.source,
  ]);
  expect(io.webcam.mock.calls[0]![5]).toBe(admitted.camera.drawable);
  expect(output).toMatchObject({ cameraMediaTime: 0.96, cameraGeneration: 12 });
  expect(endpoint.close).not.toHaveBeenCalled();
  expect(leases[1]!.release).toHaveBeenCalledOnce();
  output.release();
  prepared.release();
  renderer.dispose();
});

it('closes a decoded background when its retained reservation cannot be admitted', async () => {
  const { resources } = setup();
  vi.mocked(resources.bytes).mockImplementation(() => {
    throw new Error('allocation plan exceeded');
  });
  const bitmap = { width: 2000, height: 1000, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
  });
  const input = scene();
  input.background = {
    enabled: true,
    type: 'image',
    assetId: 'logo',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  await expect(renderer.prepare(input, dimensions, new AbortController().signal)).rejects.toThrow(
    'allocation plan exceeded'
  );
  expect(bitmap.close).toHaveBeenCalledOnce();
  renderer.dispose();
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('reserves the selected header backing before decode and releases it with the bitmap', async () => {
  const { resources, reservations } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  input.windowHeader = { ...DEFAULT_WINDOW_HEADER, title: 'Example', url: 'example.test' };
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  const options = io.header.mock.calls[0]![2];
  expect(resources.bytes).toHaveBeenCalledWith(
    'preview-header-bitmap',
    options.backing.width * options.backing.height * 4
  );
  expect(vi.mocked(resources.bytes).mock.invocationCallOrder[0]).toBeLessThan(
    io.header.mock.invocationCallOrder[0]!
  );
  renderer.render(prepared, frame()).release();
  const bitmap = await io.header.mock.results[0]!.value;
  renderer.dispose();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(reservations[0]).toHaveBeenCalledOnce();
});

function allocationInput(): NonNullable<
  Parameters<typeof createReviewPreviewRenderer>[0]['allocation']
> extends { describe(): infer T }
  ? T
  : never {
  return {
    publication: { backing: dimensions.backing, previousFront: { width: 10, height: 10 } },
    admission: {
      source: { kind: 'video-frame', allocationBytes: 1000 },
      camera: { retained: null, active: null },
      transition: null,
    },
    assets: {
      backgroundBitmap: null,
      headerBitmap: null,
      watermark: null,
      previousWatermarkCache: null,
    },
    background: null,
    scene: {
      transitionRaster: null,
      windowRaster: null,
      motionPass: null,
      spatial: null,
      spotlight: null,
      border: null,
      denseCommentGradient: null,
      denseBackgroundGradient: null,
    },
  };
}

it('admits bitmap and retained transition bytes before reservation and refreshes cached limits', async () => {
  const { resources } = setup();
  const bitmap = { width: 100, height: 50, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const replaceLimits = vi.fn();
  const input = allocationInput();
  input.admission.transition = [
    { kind: 'video-frame', allocationBytes: 1000 },
    { kind: 'video-frame', allocationBytes: 2000 },
  ];
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
    allocation: { replaceLimits, describe: () => input },
  });
  const snapshot = scene();
  snapshot.background = {
    enabled: true,
    type: 'image',
    assetId: 'asset:background',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  const prepared = await renderer.prepare(snapshot, dimensions, new AbortController().signal);
  expect(replaceLimits.mock.calls[0]![0]).toMatchObject({
    maximumManagedBytes: 3400,
    maximumCanvases: 1,
  });
  expect(replaceLimits.mock.calls[1]![0]).toMatchObject({
    maximumManagedBytes: 23400,
    maximumCanvases: 1,
  });
  expect(replaceLimits.mock.invocationCallOrder[1]).toBeLessThan(
    vi.mocked(resources.bytes).mock.invocationCallOrder[0]!
  );
  expect(prepared.allocationAssets.backgroundBitmap).toEqual({ width: 100, height: 50 });
  expect(prepared.watermarkBounds).toEqual({ x: 1, y: 1, width: 10, height: 10 });
  prepared.release();
  const count = replaceLimits.mock.calls.length;
  input.publication.previousFront = { width: 20, height: 20 };
  const next = await renderer.prepare(snapshot, dimensions, new AbortController().signal);
  expect(replaceLimits).toHaveBeenCalledTimes(count + 1);
  expect(createImageBitmap).toHaveBeenCalledOnce();
  next.release();
  renderer.dispose();
});

it('closes discovered bitmap when exact admission is refused without reserving it', async () => {
  const { resources } = setup();
  const bitmap = { width: 100, height: 50, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
    allocation: {
      describe: allocationInput,
      replaceLimits: (limits) => {
        if (limits.maximumManagedBytes > 400) throw new Error('admission refused');
      },
    },
  });
  const snapshot = scene();
  snapshot.background = {
    enabled: true,
    type: 'image',
    assetId: 'asset:background',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  await expect(
    renderer.prepare(snapshot, dimensions, new AbortController().signal)
  ).rejects.toThrow('admission refused');
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(resources.bytes).not.toHaveBeenCalled();
  renderer.dispose();
});

it('evaluates the immutable outer plan at each represented frame after watermark and blackout', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const settings = createNewWorkspacePresentationSettings();
  settings.color = '#ff0000ff';
  const result = planReviewPresentationSequence({
    settings,
    mainDuration: 4,
    fragmentOffset: 0,
    includeBookends: true,
    rate: { numerator: 60, denominator: 1 },
  });
  if (!result.ok) throw new Error('Expected valid plan');
  const input = { ...scene(), outerFadePlan: result.plan };
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  const first = renderer.render(prepared, { ...frame(), resultTime: 0.2 });
  expect(io.order.slice(-3)).toEqual(['watermark', 'blackout', 'outer-fade']);
  expect(leases[0]!.context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 640, 360);
  expect(leases[0]!.context.globalAlpha).toBeCloseTo(0.5);
  expect(leases[0]!.context.fillStyle).toBe('#ff0000ff');
  expect(leases[0]!.context.globalCompositeOperation).toBe('source-over');
  first.release();
  renderer.render(prepared, { ...frame(), resultTime: 1 }).release();
  expect(leases[1]!.context.globalAlpha).toBe(0);
  expect(io.watermark).toHaveBeenCalledOnce();
  renderer.render(prepared, { ...frame(), resultTime: 4 }).release();
  expect(leases[2]!.context.globalAlpha).toBe(1);
  renderer.dispose();
});
