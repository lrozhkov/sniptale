// @vitest-environment jsdom
import { createGradientPaint } from '@sniptale/foundation/paint';
import { createCanvasComment } from '../../features/video/review/comments';
import { updateQuickEditBackground } from '../../features/video/review/advanced/background';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
import { expect, it, vi } from 'vitest';
import {
  calculatePreviewRenderAllocation,
  calculatePreviewPreparationAllocation,
  resolvePreviewRenderAllocation,
  type PreviewRuntimeAllocationInput,
  type PreviewPreparationAllocationInput,
  type PreviewRenderAllocationInput,
} from './preview-render-allocation';
import { createPreviewRenderResources } from './preview-render-resources';

const size = { width: 10, height: 10 };
function input(): PreviewRenderAllocationInput {
  return {
    publication: { backing: size, previousFront: null },
    admission: {
      source: { kind: 'canvas', size },
      camera: { retained: null, active: null },
      transition: null,
    },
    assets: {
      headerBitmap: null,
      backgroundBitmap: null,
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
function phase(plan: ReturnType<typeof calculatePreviewRenderAllocation>, name: string) {
  const found = plan.phases.find((value) => value.name === name);
  if (!found) throw new Error(`Missing phase ${name}`);
  return found;
}

it('counts exactly front, staging and frozen source without an arbitrary reserve', () => {
  const plan = calculatePreviewRenderAllocation(input());
  expect(plan.maximumManagedBytes).toBe(1200);
  expect(plan.maximumCanvases).toBe(3);
});

it('distinguishes video-frame storage from canvases and counts camera retained/active copies', () => {
  const graph = input();
  graph.admission.source = { kind: 'video-frame', allocationBytes: 150 };
  graph.admission.camera = {
    retained: { kind: 'video-frame', allocationBytes: 80 },
    active: { kind: 'video-frame', allocationBytes: 80 },
  };
  graph.admission.transition = [
    { kind: 'canvas', size },
    { kind: 'video-frame', allocationBytes: 150 },
  ];
  const plan = calculatePreviewRenderAllocation(graph);
  expect(plan.maximumManagedBytes).toBe(1660);
  expect(plan.maximumCanvases).toBe(3);
  expect(phase(plan, 'prepare-background').bytes).toBe(1030);
});

it.each([false, true])('uses actual odd spatial levels with half-float=%s', (halfFloat) => {
  const graph = input();
  graph.scene.spatial = { backing: { width: 5, height: 3 }, halfFloat };
  const plan = calculatePreviewRenderAllocation(graph);
  expect(plan.maximumManagedBytes).toBe(1200 + 4 * 60 + 232 + 60 + 13 * (halfFloat ? 8 : 4));
  expect(plan.maximumCanvases).toBe(6);
});

it('accounts minimum one-pixel spotlight tiles and their prefix array', () => {
  const graph = input();
  graph.scene.spotlight = {
    backing: { width: 1, height: 1 },
    frameCount: 10,
    blurRadius: 0,
    fastPath: false,
  };
  const plan = calculatePreviewRenderAllocation(graph);
  expect(phase(plan, 'spotlight-coverage').bytes).toBe(1200 + 8 + 4 + 22 * 4 + 11 * 8);
});

it('counts the full spotlight path surface while bounding only coverage readback tiles', () => {
  const graph = input();
  graph.scene.spotlight = { backing: size, frameCount: 1, blurRadius: 0, fastPath: false };
  const plan = calculatePreviewRenderAllocation(graph);
  // One100-pixel path surface, two100-pixel masks,20-pixel coverage tile.
  expect(phase(plan, 'spotlight-coverage').bytes).toBe(1200 + 3 * 400 + 3 * 20 * 4);
});

it('takes phase maximum instead of adding spotlight and border scratch peaks', () => {
  const graph = input();
  graph.scene.spotlight = { backing: size, frameCount: 1, blurRadius: 2, fastPath: true };
  graph.scene.border = size;
  const plan = calculatePreviewRenderAllocation(graph);
  expect(plan.maximumManagedBytes).toBe(1200 + 26 * 26 * 4);
  expect(plan.maximumCanvases).toBe(5);
});

it('includes background replacement and nested window/motion allocations during blur', () => {
  const graph = input();
  graph.background = {
    cache: size,
    previousCache: { width: 5, height: 5 },
    blurRadius: 1,
    denseGradient: false,
  };
  graph.scene.windowRaster = size;
  graph.scene.motionPass = size;
  const plan = calculatePreviewRenderAllocation(graph);
  expect(phase(plan, 'background-rebuild-blur').bytes).toBe(1200 + 1200 + 100 + 800 + 1600);
  expect(phase(plan, 'background-rebuild-blur').canvases).toBe(10);
});

it('keeps previous front and watermark replacement during sequential image preparation', () => {
  const graph = input();
  graph.publication.previousFront = { width: 20, height: 20 };
  graph.assets.backgroundBitmap = size;
  graph.assets.headerBitmap = { width: 10, height: 2 };
  graph.assets.previousWatermarkCache = size;
  graph.assets.watermark = {
    cache: size,
    preparation: { kind: 'image', source: { width: 100, height: 100 } },
  };
  const plan = calculatePreviewRenderAllocation(graph);
  expect(phase(plan, 'prepare-watermark').bytes).toBe(1600 + 400 + 80 + 400 + 400 + 40000);
  expect(phase(plan, 'prepare-background').bytes).toBe(2000);
  expect(phase(plan, 'scene').bytes).toBe(1600 + 400 + 400 + 400 + 80 + 400);
});

it('measures text before allocating its cache and includes exact gradient table storage', () => {
  const graph = input();
  graph.assets.watermark = { cache: size, preparation: { kind: 'text' } };
  graph.scene.denseCommentGradient = size;
  const plan = calculatePreviewRenderAllocation(graph);
  expect(phase(plan, 'measure-watermark').bytes).toBe(404);
  expect(phase(plan, 'prepare-watermark').bytes).toBe(800);
  expect(phase(plan, 'comment-gradient').bytes).toBe(1600 + 800 + 4097 * 4);
});

it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])(
  'rejects invalid or overflowing dimensions %s',
  (width) => {
    const graph = input();
    graph.publication.backing = { width, height: 10 };
    expect(() => calculatePreviewRenderAllocation(graph)).toThrow('Invalid preview allocation');
  }
);

it('enforces the calculated exact graph through real session accounting', () => {
  const plan = calculatePreviewRenderAllocation(input());
  const context = { clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
  const resources = createPreviewRenderResources({
    ...plan,
    createCanvas: () => {
      const canvas = document.createElement('canvas');
      vi.spyOn(canvas, 'getContext').mockReturnValue(context);
      return canvas;
    },
  });
  const leases = ['front', 'staging', 'source'].map((role) => resources.canvas(role, size));
  expect(resources.counters.managedBytes).toBe(plan.maximumManagedBytes);
  expect(() => resources.bytes('overflow', 1)).toThrow();
  for (const lease of leases) lease.release();
  resources.dispose();
  expect(resources.counters.managedBytes).toBe(0);
});

it('retains composited transition source independently of admitted endpoints through overlay phases', () => {
  const graph = input();
  graph.admission.transition = [
    { kind: 'canvas', size },
    { kind: 'canvas', size },
  ];
  graph.scene.transitionRaster = size;
  const plan = calculatePreviewRenderAllocation(graph);
  expect(phase(plan, 'scene').bytes).toBe(2400);
  expect(phase(plan, 'border').bytes).toBe(2400);
  expect(plan.maximumCanvases).toBe(6);
  expect(phase(plan, 'scene').allocations.map((value) => value.role)).toEqual([
    'publication-front',
    'publication-staging',
    'source',
    'transition-0',
    'transition-1',
    'preview-transition-source',
  ]);
});

function discovery(): PreviewPreparationAllocationInput {
  return {
    previousFront: null,
    retainedCamera: null,
    backgroundBitmap: null,
    headerBitmap: null,
    measurement: false,
    watermark: null,
  };
}

it('reports zero actual storage for empty discovery despite constructor control minimums', () => {
  const plan = calculatePreviewPreparationAllocation(discovery());
  expect(plan.maximumManagedBytes).toBe(1);
  expect(plan.maximumCanvases).toBe(1);
  expect(plan.phases[0]).toEqual({ name: 'preparation', allocations: [], bytes: 0, canvases: 0 });
  const resources = createPreviewRenderResources(plan);
  expect(resources.counters.managedBytes).toBe(0);
  expect(resources.counters.canvasCount).toBe(0);
  resources.dispose();
});

it('admits only known discovery resources without fabricated source or staging rasters', () => {
  const input = discovery();
  input.previousFront = size;
  input.retainedCamera = { kind: 'video-frame', allocationBytes: 137 };
  input.backgroundBitmap = { width: 20, height: 10 };
  input.headerBitmap = { width: 10, height: 2 };
  input.measurement = true;
  const plan = calculatePreviewPreparationAllocation(input);
  expect(plan.maximumManagedBytes).toBe(400 + 137 + 800 + 80 + 4);
  expect(plan.maximumCanvases).toBe(2);
  expect(plan.phases[0]?.allocations.map((value) => value.role)).toEqual([
    'publication-front',
    'camera-retained',
    'background-bitmap',
    'header-bitmap',
    'watermark-measurement',
  ]);
});

it('counts the actual watermark image only while it overlaps measured cache preparation', () => {
  const input = discovery();
  input.watermark = {
    cache: size,
    preparation: { kind: 'image', source: { width: 50, height: 20 } },
  };
  expect(calculatePreviewPreparationAllocation(input).maximumManagedBytes).toBe(400 + 4000);
  input.watermark = { cache: size, preparation: { kind: 'text' } };
  expect(calculatePreviewPreparationAllocation(input).maximumManagedBytes).toBe(400);
});

it('rejects unknown-sized or invalid decoded payloads before discovery admission', () => {
  const input = discovery();
  input.retainedCamera = { kind: 'video-frame', allocationBytes: NaN };
  expect(() => calculatePreviewPreparationAllocation(input)).toThrow('Invalid preview allocation');
  input.retainedCamera = null;
  input.backgroundBitmap = { width: 0, height: 100 };
  expect(() => calculatePreviewPreparationAllocation(input)).toThrow('Invalid preview allocation');
});

function runtimeInput(): PreviewRuntimeAllocationInput {
  return {
    scene: {
      source: { width: 1920, height: 1080 },
      background: { enabled: false },
      zoomRegions: [],
      comments: [],
      keys: [],
      clicks: [],
    },
    dimensions: { canonical: { width: 1920, height: 1080 }, backing: { width: 640, height: 360 } },
    sourceTime: 1,
    resultTime: 1,
    sourceAllocationBytes: null,
    sourceBacking: { width: 640, height: 360 },
    camera: { retainedBytes: null, activeBytes: null },
    transitionBytes: null,
    previousFront: null,
    assets: {
      backgroundBitmap: null,
      headerBitmap: null,
      watermark: null,
      previousWatermarkCache: null,
    },
  };
}

it('resolves a plain runtime graph without inventing a pre-capture source allocation', () => {
  const runtime = runtimeInput();
  const graph = resolvePreviewRenderAllocation(runtime);
  expect(graph.admission.source).toBeNull();
  expect(graph.scene.spatial).toBeNull();
  expect(graph.scene.motionPass).toBeNull();
  expect(calculatePreviewRenderAllocation(graph).maximumManagedBytes).toBe(2 * 640 * 360 * 4);
  runtime.sourceAllocationBytes = 123456;
  expect(resolvePreviewRenderAllocation(runtime).admission.source).toEqual({
    kind: 'video-frame',
    allocationBytes: 123456,
  });
});

it('maps real header geometry and separate transition source backing', () => {
  const runtime = runtimeInput();
  runtime.scene.windowHeader = DEFAULT_WINDOW_HEADER;
  runtime.assets.headerBitmap = { width: 640, height: 40 };
  runtime.transitionBytes = [100, 200];
  runtime.sourceBacking = { width: 320, height: 180 };
  const graph = resolvePreviewRenderAllocation(runtime);
  expect(graph.scene.windowRaster?.width).toBeGreaterThan(0);
  expect(graph.scene.windowRaster?.height).toBeGreaterThan(0);
  expect(graph.scene.transitionRaster).toEqual({ width: 320, height: 180 });
  expect(graph.admission.transition).toEqual([
    { kind: 'video-frame', allocationBytes: 100 },
    { kind: 'video-frame', allocationBytes: 200 },
  ]);
});

it('keeps session spatial storage budget outside the current active region and reports unknown format bound', () => {
  const runtime = runtimeInput();
  runtime.scene.zoomRegions = [
    {
      ...createQuickEditZoomRegion({ id: 'spatial', at: 0, duration: 3, endMax: 3 }),
      perspective: { enabled: true, rotateX: 10, rotateY: 20, rotateZ: 0, strength: 0.5 },
    },
  ];
  runtime.resultTime = 10;
  const pending = resolvePreviewRenderAllocation(runtime);
  expect(pending.scene.spatial).toEqual({ backing: runtime.dimensions.backing, halfFloat: true });
  expect(pending.upperBounds.spatialFormatPending).toBe(true);
  runtime.spatialHalfFloat = false;
  expect(resolvePreviewRenderAllocation(runtime).scene.spatial?.halfFloat).toBe(false);
});

it('keeps retained transition endpoints admitted during discovery', () => {
  const input = discovery();
  input.retainedTransition = [
    { kind: 'video-frame', allocationBytes: 100 },
    { kind: 'video-frame', allocationBytes: 200 },
  ];
  const plan = calculatePreviewPreparationAllocation(input);
  expect(plan.maximumManagedBytes).toBe(300);
  expect(plan.phases[0]?.canvases).toBe(0);
});

it('reports a canonical comment style bound rather than a full-output scratch guess', () => {
  const runtime = runtimeInput();
  const comment = createCanvasComment({ id: 'gradient', start: 0, end: 2 });
  comment.attachment = 'viewport';
  comment.style = {
    ...comment.style,
    width: 120,
    fillPaint: createGradientPaint('#ff0000', () => 'stop'),
  };
  runtime.scene.comments = [{ ...comment, resolvedText: 'Visible label' }];
  const graph = resolvePreviewRenderAllocation(runtime);
  expect(graph.upperBounds.commentGradient?.width).toBe(40);
  expect(graph.upperBounds.commentGradient?.height).toBeLessThanOrEqual(360);
  expect(graph.scene.denseCommentGradient).toEqual(graph.upperBounds.commentGradient);
  runtime.sourceTime = 3;
  expect(resolvePreviewRenderAllocation(runtime).upperBounds.commentGradient).toBeNull();
});

it('derives background cache clamp and scaled blur from actual chosen backing', () => {
  const runtime = runtimeInput();
  runtime.dimensions.backing = { width: 3840, height: 2160 };
  runtime.scene.background = updateQuickEditBackground(
    { enabled: false },
    {
      enabled: true,
      type: 'gradient',
      layout: { padding: 40, cornerRadius: 12, blur: 6 },
    }
  );
  const graph = resolvePreviewRenderAllocation(runtime);
  expect(graph.background?.cache).toEqual({ width: 2048, height: 1152 });
  expect(graph.background?.blurRadius).toBeCloseTo((6 * 2 * 2048) / 3840);
  expect(graph.upperBounds.gradientFallback).toBe(true);
  expect(graph.scene.denseBackgroundGradient).toBeNull();
});
