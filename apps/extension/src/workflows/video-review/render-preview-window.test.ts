import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';
import { createPreviewRenderResources } from './preview-render-resources';
import {
  resolvePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from './preview-render-allocation';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createQuickEditBorder } from '../../features/video/project/scene/focus-appearance';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { createReviewPreviewRenderer } from './render-preview';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import type { PreviewScene } from './preview-scene';

const io = vi.hoisted(() => ({ scene: vi.fn(), header: vi.fn() }));
vi.mock('./scene-frame', () => ({ drawReviewSceneFrame: io.scene }));
vi.mock('./window-header', async (original) => ({
  ...(await original<typeof import('./window-header')>()),
  loadReviewWindowHeader: io.header,
}));
vi.mock('./scene-background', () => ({ createReviewBackgroundPainter: () => ({ dispose() {} }) }));

beforeEach(() => {
  vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } });
  io.scene.mockReset();
  io.header.mockResolvedValue({ width: 640, height: 30, close: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

function canvasContext() {
  return {
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    rect: vi.fn(),
    beginPath: vi.fn(),
    clip: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function setup(override?: Parameters<typeof createReviewPreviewRenderer>[0]) {
  const leases: { role: string; release: ReturnType<typeof vi.fn> }[] = [];
  const resources: RenderResources = override?.resources ?? {
    canvas(role, size) {
      const release = vi.fn();
      leases.push({ role, release });
      return {
        canvas: { ...size } as HTMLCanvasElement,
        context: canvasContext(),
        release,
      };
    },
    bytes: () => ({ release() {} }),
  };
  const renderer = createReviewPreviewRenderer({ ...override, resources });
  const source = { width: 1280, height: 720 };
  const scene: PreviewScene = {
    source,
    background: { enabled: false },
    windowHeader: { ...DEFAULT_WINDOW_HEADER },
    zoomRegions: [],
    comments: [],
    clicks: [],
    keys: [],
  };
  const dimensions = { canonical: source, backing: { width: 640, height: 360 } };
  const draw = vi.fn();
  const frame = (timestamp = 1) => ({
    generation: 1,
    sourceTime: timestamp,
    resultTime: timestamp,
    source: { timestamp, backing: source, draw },
  });
  const raster = () => io.scene.mock.lastCall?.[1].windowRaster;
  return { renderer, scene, dimensions, frame, draw, leases, raster };
}

it('retains one isolated decorated source and replaces it when the native frame changes', async () => {
  const f = setup();
  const prepared = await f.renderer.prepare(f.scene, f.dimensions, new AbortController().signal);
  (await f.renderer.render(prepared, f.frame())).release();
  const original = f.raster();
  expect(original).toBeDefined();
  expect(f.draw).toHaveBeenCalledOnce();
  (await f.renderer.render(prepared, f.frame())).release();
  expect(f.raster()).toBe(original);
  expect(f.draw).toHaveBeenCalledOnce();
  const old = f.leases.find((lease) => lease.role === 'decorated-window')!;
  expect(old.release).not.toHaveBeenCalled();
  (await f.renderer.render(prepared, f.frame(2))).release();
  expect(f.raster()).not.toBe(original);
  expect(f.draw).toHaveBeenCalledTimes(2);
  expect(old.release).toHaveBeenCalledOnce();
  f.renderer.dispose();
  expect(f.leases.filter((lease) => lease.role === 'decorated-window')).toHaveLength(2);
  for (const lease of f.leases) expect(lease.release).toHaveBeenCalledOnce();
});

it('releases the retained window before replacing preparation geometry', async () => {
  const f = setup();
  const prepared = await f.renderer.prepare(f.scene, f.dimensions, new AbortController().signal);
  (await f.renderer.render(prepared, f.frame())).release();
  const original = f.leases.find((lease) => lease.role === 'decorated-window')!;
  const next = await f.renderer.prepare(
    f.scene,
    { ...f.dimensions, backing: { width: 320, height: 180 } },
    new AbortController().signal
  );
  expect(original.release).toHaveBeenCalledOnce();
  (await f.renderer.render(next, f.frame())).release();
  f.renderer.dispose();
  for (const lease of f.leases) expect(lease.release).toHaveBeenCalledOnce();
});

it('releases a failed window and retries without publishing stale source pixels', async () => {
  const f = setup();
  const prepared = await f.renderer.prepare(f.scene, f.dimensions, new AbortController().signal);
  f.draw.mockImplementationOnce(() => {
    throw new Error('native draw failed');
  });
  await expect(f.renderer.render(prepared, f.frame())).rejects.toThrow('native draw failed');
  expect(
    f.leases.find((lease) => lease.role === 'decorated-window')!.release
  ).toHaveBeenCalledOnce();
  expect(io.scene).not.toHaveBeenCalled();
  (await f.renderer.render(prepared, f.frame())).release();
  expect(f.raster()).toBeDefined();
  f.renderer.dispose();
  for (const lease of f.leases) expect(lease.release).toHaveBeenCalledOnce();
});

it('fits a retained source and overlapping front/publication in the existing allocation graph', async () => {
  const resources = createPreviewRenderResources({
    maximumCanvases: 1,
    maximumManagedBytes: 1,
    createCanvas: () =>
      ({ width: 0, height: 0, getContext: () => canvasContext() }) as unknown as HTMLCanvasElement,
  });
  let f!: ReturnType<typeof setup>;
  let previousFront: { width: number; height: number } | null = null;
  let assets: PreviewRenderAllocationInput['assets'] = {
    backgroundBitmap: null,
    headerBitmap: null,
    watermark: null,
    previousWatermarkCache: null,
  };
  f = setup({
    resources,
    allocation: {
      describe: () =>
        resolvePreviewRenderAllocation({
          scene: f.scene,
          dimensions: f.dimensions,
          resultTime: 1,
          sourceTime: 1,
          sourceAllocationBytes: null,
          sourceBacking: f.scene.source,
          camera: { retainedBytes: null, activeBytes: null },
          transitionBytes: null,
          previousFront,
          assets,
        }),
      replaceLimits: (limits) => resources.replaceLimits(limits),
    },
  });
  const prepared = await f.renderer.prepare(f.scene, f.dimensions, new AbortController().signal);
  assets = prepared.allocationAssets;
  const front = await f.renderer.render(prepared, f.frame());
  const raster = f.raster();
  previousFront = f.dimensions.backing;
  f.scene = {
    ...f.scene,
    zoomRegions: [
      { ...createQuickEditZoomRegion({ id: 'border', at: 0 }), border: createQuickEditBorder() },
    ],
  };
  const draft = await f.renderer.prepare(f.scene, f.dimensions, new AbortController().signal);
  assets = draft.allocationAssets;
  const output = await f.renderer.render(draft, f.frame());
  expect(f.raster()).toBe(raster);
  expect(resources.counters.peakCanvasCount).toBe(3);
  expect(f.draw).toHaveBeenCalledOnce();
  output.release();
  front.release();
  f.renderer.dispose();
  resources.dispose();
  expect(resources.counters.managedBytes).toBe(0);
  expect(resources.counters.canvasCount).toBe(0);
});

it('keeps the original dynamic raster path for magnifying click cues', async () => {
  const f = setup();
  f.scene.clicks = [
    {
      settings: { ...REVIEW_CLICK_DEFAULT, effect: 'magnify' },
      point: { x: 0.5, y: 0.5 },
      anchor: 1,
      start: 0,
      end: 2,
    },
  ];
  const prepared = await f.renderer.prepare(f.scene, f.dimensions, new AbortController().signal);
  (await f.renderer.render(prepared, f.frame())).release();
  expect(f.raster()).toBeUndefined();
  expect(f.leases.some((lease) => lease.role === 'decorated-window')).toBe(false);
  f.renderer.dispose();
});
