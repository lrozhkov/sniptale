import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { createReviewPreviewRenderer } from './render-preview';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

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
  expect(io.cameraPlan).toHaveBeenCalled();
  const count = io.cameraPlan.mock.calls.length;
  (await renderer.render(prepared, { ...frame(), resultTime: 6 })).release();
  expect(io.cameraPlan).toHaveBeenCalledTimes(count);
  renderer.dispose();
});
