import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';
import { afterEach, expect, it, vi } from 'vitest';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { reviewCutTransitionAt } from '../../features/video/review/cuts';
import { createReviewPreviewRenderer } from './render-preview';
const io = vi.hoisted(() => ({
  order: [] as string[],
  background: vi.fn(),
  watermark: vi.fn(),
  header: vi.fn(),
}));
vi.mock('./window-header', async (original) => ({
  ...(await original<typeof import('./window-header')>()),
  loadReviewWindowHeader: io.header,
}));
vi.mock('./scene-frame', () => ({ drawReviewSceneFrame: vi.fn() }));
vi.mock('./render-scene-overlays', () => ({ drawReviewSceneOverlays: vi.fn() }));
vi.mock('../../features/video/composition/canvas/watermark', () => ({
  createWatermarkRenderer: io.watermark,
  measureWatermark: async () => ({ cache: null, source: null, paint: vi.fn() }),
}));
vi.mock('./scene-background', () => ({ createReviewBackgroundPainter: io.background }));
vi.mock('../../features/video/composition/canvas/spatial-renderer', () => ({
  createReviewSpatialRenderer: () => ({ dispose: vi.fn() }),
}));
vi.mock('./cut-transition-frames', async (original) => ({
  ...(await original<typeof import('./cut-transition-frames')>()),
  paintReviewCutTransition: vi.fn(),
  paintReviewCutBlackout: vi.fn(),
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
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
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
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

it('admits the actual retained background cache on regular and dissolve replacement paths', async () => {
  vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() }))
  );
  const { resources } = setup();
  const retained = { width: 640, height: 360 };
  io.background.mockImplementation(() => ({
    draw: vi.fn(),
    dispose: vi.fn(),
    get retainedCacheSize() {
      return { ...retained };
    },
  }));
  const input = allocationInput();
  input.background = { cache: retained, previousCache: null, blurRadius: 12, denseGradient: false };
  const replaceLimits = vi.fn();
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
    allocation: { describe: () => input, replaceLimits },
  });
  const snapshot = scene();
  snapshot.background = {
    enabled: true,
    type: 'image',
    assetId: 'image',
    imageFit: 'cover',
    layout: { padding: 0, cornerRadius: 0, blur: 36 },
  };
  const prepared = await renderer.prepare(snapshot, dimensions, new AbortController().signal);
  const { calculatePreviewRenderAllocation } = await import('./preview-render-allocation');
  const expected = calculatePreviewRenderAllocation({
    ...input,
    assets: prepared.allocationAssets,
    background: { ...input.background, previousCache: retained },
  });
  (await renderer.render(prepared, frame())).release();
  expect(replaceLimits.mock.calls.at(-1)![0]).toEqual({
    maximumManagedBytes: expected.maximumManagedBytes,
    maximumCanvases: expected.maximumCanvases,
  });
  const blend = reviewCutTransitionAt(2, [
    {
      id: 'seam',
      type: 'dissolve',
      seam: 2,
      before: 0.5,
      after: 0.5,
      left: { start: 0, end: 2 },
      right: { start: 4, end: 6 },
    },
  ])!;
  (
    await renderer.render(prepared, {
      ...frame(),
      transition: {
        blend,
        frames: {
          left: { timestamp: 1.9, draw: vi.fn(), close: vi.fn() },
          right: { timestamp: 4, draw: vi.fn(), close: vi.fn() },
        },
      },
    })
  ).release();
  expect(replaceLimits.mock.calls.at(-1)![0].maximumManagedBytes).toBeGreaterThanOrEqual(
    expected.maximumManagedBytes
  );
  expect(input.background.previousCache).toBeNull();
  prepared.release();
  renderer.dispose();
});

it.each([false, true])(
  'reserves the selected header backing before decode with magnify=%s and releases it with the bitmap',
  async (magnify) => {
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } });
    io.background.mockReturnValue({ draw: vi.fn(), dispose: vi.fn(), retainedCacheSize: null });
    io.header.mockImplementation(
      async (
        _url: string,
        _signal: AbortSignal,
        options: { backing: { width: number; height: number } }
      ) => ({ ...options.backing, close: vi.fn() })
    );
    const { resources, reservations } = setup();
    const renderer = createReviewPreviewRenderer({ resources });
    const input = scene();
    input.windowHeader = { ...DEFAULT_WINDOW_HEADER, title: 'Example', url: 'example.test' };
    if (magnify)
      input.clicks = [
        {
          settings: { ...REVIEW_CLICK_DEFAULT, effect: 'magnify' },
          point: { x: 0.5, y: 0.025 },
          anchor: 1,
          start: 0,
          end: 2,
        },
      ];
    const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
    const options = io.header.mock.calls[0]![2];
    if (magnify) expect(options.backing.width).toBe(1920);
    else expect(options.backing.width).toBeLessThanOrEqual(dimensions.backing.width);
    expect(resources.bytes).toHaveBeenCalledWith(
      'preview-header-bitmap',
      options.backing.width * options.backing.height * 4
    );
    expect(vi.mocked(resources.bytes).mock.invocationCallOrder[0]).toBeLessThan(
      io.header.mock.invocationCallOrder[0]!
    );
    (await renderer.render(prepared, frame())).release();
    const bitmap = await io.header.mock.results[0]!.value;
    renderer.dispose();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(reservations[0]).toHaveBeenCalledOnce();
  }
);
