// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { calculateSpatialRenderAllocations } from './spatial-render-allocation';
import { createGradientPaint } from '@sniptale/foundation/paint';
import { createCanvasComment } from '../../features/video/review/comments';
import { updateQuickEditBackground } from '../../features/video/review/advanced/background';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';
import {
  calculatePreviewRenderAllocation,
  resolvePreviewRenderAllocation,
  type PreviewRuntimeAllocationInput,
} from './preview-render-allocation';

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

it('forwards publication kinds and retired provider bytes from the runtime descriptor', () => {
  const size = { width: 10, height: 10 };
  const runtime = runtimeInput();
  runtime.outputKind = 'gpu-surface';
  runtime.previousFront = size;
  runtime.previousFrontKind = 'gpu-surface';
  runtime.previousProviderBytes = 1200;
  expect(resolvePreviewRenderAllocation(runtime).publication).toEqual({
    backing: runtime.dimensions.backing,
    previousFront: size,
    outputKind: 'gpu-surface',
    previousFrontKind: 'gpu-surface',
    previousProviderBytes: 1200,
  });
});

it('reserves no spatial surfaces for neutral enabled poses and admits an actual rotation', () => {
  const runtime = runtimeInput();
  const region = {
    ...createQuickEditZoomRegion({ id: 'neutral', at: 0 }),
    perspective: { enabled: true, rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0.5 },
  };
  runtime.scene.zoomRegions = [region];
  expect(resolvePreviewRenderAllocation(runtime).scene.spatial).toBeNull();
  runtime.scene.zoomRegions = [{ ...region, perspective: { ...region.perspective, rotateZ: 5 } }];
  expect(resolvePreviewRenderAllocation(runtime).scene.spatial).not.toBeNull();
});

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

it('maps source-density joined raster and explicit lens phase only while magnification is active', () => {
  const runtime = runtimeInput();
  runtime.scene.windowHeader = DEFAULT_WINDOW_HEADER;
  runtime.assets.headerBitmap = { width: 1920, height: 106 };
  runtime.scene.clicks = [
    {
      settings: { ...REVIEW_CLICK_DEFAULT, effect: 'magnify' },
      point: { x: 0.5, y: 0.025 },
      anchor: 1,
      start: 0,
      end: 2,
    },
  ];
  const graph = resolvePreviewRenderAllocation(runtime);
  expect(graph.scene.windowRaster?.width).toBe(1920);
  expect(graph.scene.clickLens).toBe(true);
  const lensPhase = calculatePreviewRenderAllocation(graph).phases.find(
    (value) => value.name === 'click-lens'
  );
  if (!lensPhase) throw new Error('Missing phase click-lens');
  expect(lensPhase.allocations).toContainEqual({
    role: 'decorated-window',
    bytes: 1920 * graph.scene.windowRaster!.height * 4,
    canvases: 1,
  });
  runtime.resultTime = 0;
  const identity = resolvePreviewRenderAllocation(runtime);
  expect(identity.scene.clickLens).toBe(false);
  expect(identity.scene.windowRaster?.width).toBeLessThan(1920);
  expect(
    calculatePreviewRenderAllocation(identity).phases.some((value) => value.name === 'click-lens')
  ).toBe(false);
  runtime.assets.headerBitmap = null;
  runtime.resultTime = 1;
  expect(resolvePreviewRenderAllocation(runtime).scene.windowRaster).toBeNull();
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
  expect(pending.scene.spatial).toEqual({
    output: runtime.dimensions.backing,
    plane: { x: 0, y: 0, ...runtime.dimensions.backing },
    overlay: runtime.dimensions.backing,
    halfFloat: true,
  });
  expect(pending.upperBounds.spatialFormatPending).toBe(true);
  runtime.spatialHalfFloat = false;
  expect(resolvePreviewRenderAllocation(runtime).scene.spatial?.halfFloat).toBe(false);
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

it('reserves default cursor Orbit before activation and suppresses saved manual effects for explicit Off', () => {
  const runtime = runtimeInput();
  const region = createQuickEditZoomRegion({ id: 'new-cursor', at: 5, duration: 3 });
  region.cursorFocus = {
    path: {
      version: 1,
      mode: 'follow',
      smoothing: 0.5,
      sensitivity: 0.5,
      gapPolicy: 'hold',
      segments: [],
    },
  };
  runtime.scene.zoomRegions = [region];
  runtime.resultTime = 0;
  expect(region.perspective).toBeUndefined();
  expect(resolvePreviewRenderAllocation(runtime).scene.spatial).not.toBeNull();
  runtime.scene.zoomRegions = [
    {
      ...region,
      cursorComposition: { ...region.cursorComposition!, mode: 'off' },
      perspective: { enabled: true, rotateX: 10, rotateY: 20, rotateZ: 0, strength: 0.5 },
      depthOfField: {
        enabled: true,
        mode: 'depth',
        x: 0.5,
        y: 0.5,
        width: 0.2,
        softness: 0.3,
        strength: 0.5,
      },
    },
  ];
  expect(resolvePreviewRenderAllocation(runtime).scene.spatial).toBeNull();
});

it('admits the expanded spatial click artwork rather than the output rectangle', () => {
  const runtime = runtimeInput();
  runtime.scene.source = { width: 640, height: 360 };
  runtime.dimensions = { canonical: runtime.scene.source, backing: { width: 320, height: 180 } };
  runtime.scene.windowHeader = { ...DEFAULT_WINDOW_HEADER, kind: 'browser', title: '' };
  runtime.scene.zoomRegions = [
    {
      ...createQuickEditZoomRegion({ id: 'tilt', at: 0, duration: 8, endMax: 8 }),
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      perspective: { enabled: true, rotateX: 12, rotateY: -18, rotateZ: 5, strength: 0.7 },
    },
  ];
  runtime.scene.clicks = [
    {
      settings: {
        ...REVIEW_CLICK_DEFAULT,
        effect: 'magnify',
        lensOptics: 'optical',
        magnification: 2,
        radius: 120,
        color: '#00000000',
        lensShadow: 0,
      },
      point: { x: 0.5, y: 0.025 },
      anchor: 1,
      start: 0,
      end: 2,
    },
  ];
  const graph = resolvePreviewRenderAllocation(runtime);
  const overlay = graph.scene.spatial!.overlay!;
  expect(overlay.width).toBeGreaterThanOrEqual(320);
  expect(overlay.height).toBeGreaterThan(180);
  const allocations = calculateSpatialRenderAllocations(graph.scene.spatial);
  expect(allocations.find(({ role }) => role === 'spatial-overlay')!.bytes).toBe(
    overlay.width * overlay.height * 4
  );
  expect(
    allocations.find(({ role }) => role === 'spatial-texture-0')!.bytes
  ).toBeGreaterThanOrEqual(overlay.width * overlay.height * 4);
  runtime.scene.clicks = [];
  expect(resolvePreviewRenderAllocation(runtime).scene.spatial!.overlay).toEqual(
    runtime.dimensions.backing
  );
});
