import { expect, it } from 'vitest';
import { reviewPresentedGeometry, reviewPresentedStageProjection } from './gpu-preview-geometry';
import { updateQuickEditBackground } from '../../features/video/review/advanced/background';
import { reviewGpuPreviewAllocation } from './gpu-preview-geometry';
import type { PreviewScene } from './preview-scene';
import {
  computeQuickEditSpatialRasterLayout,
  computeQuickEditSpatialWindow,
  computeQuickEditWindowTransform,
} from '../../features/video/review/advanced/scene';
import {
  projectQuickEditPoint,
  quickEditPlaneProjection,
} from '../../features/video/composition/motion/spatial-geometry';

const scene: PreviewScene = {
  source: { width: 640, height: 360 },
  background: { enabled: false },
  zoomRegions: [],
  comments: [],
  keys: [],
  clicks: [],
};
const dimensions = { canonical: { width: 640, height: 360 }, backing: { width: 320, height: 180 } };

it.each([0, 0.5, 1])(
  'matches source and window hits to the legacy raster at window motion %s',
  (windowMotion) => {
    const geometry = reviewPresentedGeometry(scene, dimensions, 2, {
      scale: 1.7,
      centerX: 0.6,
      centerY: 0.4,
      spatial: {
        rotation: [0, Math.sin(0.15), 0, Math.cos(0.15)],
        perspective: 0.7,
        windowMotion,
        lockBackground: true,
        focus: [],
      },
    });
    const layout = geometry.layout;
    const raster = computeQuickEditSpatialRasterLayout(layout, scene.background);
    const window = computeQuickEditWindowTransform(raster);
    const base = layout.windowRect;
    const scale = window.width / base.width;
    const point = { x: 210, y: 120 };
    const outer = quickEditPlaneProjection(
      base,
      computeQuickEditSpatialWindow(layout, scene.background),
      layout.spatial!
    );
    const expected = projectQuickEditPoint(outer, {
      x: window.x + (point.x - base.x) * scale,
      y: window.y + (point.y - base.y) * scale,
    })!;
    const projected = projectQuickEditPoint(geometry.projection, point)!;
    // Equivalent double-precision coordinate paths allow 1e-6 logical pixels of arithmetic error.
    expect(projected.x).toBeCloseTo(expected.x, 6);
    expect(projected.y).toBeCloseTo(expected.y, 6);
    const sourceCss = {
      x:
        (layout.videoTransform.x +
          ((point.x - layout.videoRect.x) * layout.videoTransform.width) / layout.videoRect.width) /
        2,
      y:
        (layout.videoTransform.y +
          ((point.y - layout.videoRect.y) * layout.videoTransform.height) /
            layout.videoRect.height) /
        2,
    };
    const shownSource = projectQuickEditPoint(
      reviewPresentedStageProjection(geometry, dimensions.backing),
      sourceCss
    )!;
    expect(shownSource.x).toBeCloseTo(expected.x / 2, 6);
    expect(shownSource.y).toBeCloseTo(expected.y / 2, 6);
    const expectedWindow = projectQuickEditPoint(outer, point)!;
    const shownWindow = projectQuickEditPoint(
      reviewPresentedStageProjection(geometry, dimensions.backing, 'window'),
      { x: point.x / 2, y: point.y / 2 }
    )!;
    expect(shownWindow.x).toBeCloseTo(expectedWindow.x / 2, 6);
    expect(shownWindow.y).toBeCloseTo(expectedWindow.y / 2, 6);
  }
);

it('accounts for annotation endpoint bitmaps and masks without changing plain scene admission', async () => {
  const { reviewGpuPreviewAllocation } = await import('./gpu-preview-geometry');
  const plain = reviewGpuPreviewAllocation(scene, dimensions);
  const annotated: PreviewScene = {
    ...scene,
    annotationEffects: {
      lane: {
        enabled: true,
        instances: [
          {
            id: 'annotation',
            snapshotId: 'snapshot',
            start: 0,
            end: 5,
            enabled: true,
            attachment: 'content',
            order: 0,
            controls: {},
            transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          },
        ],
      },
      snapshots: [],
      segments: [],
    },
  };
  const active = reviewGpuPreviewAllocation(annotated, dimensions);
  expect(active.maximumManagedBytes - plain.maximumManagedBytes).toBe(
    (320 * 180 + 640 * 360) * 4 * 2
  );
  expect(active.maximumCanvases - plain.maximumCanvases).toBe(2);
  annotated.annotationEffects!.lane.enabled = false;
  expect(reviewGpuPreviewAllocation(annotated, dimensions)).toEqual(plain);
});

it('budgets both drift caches and their blur construction scratch at physical density', () => {
  const plain = reviewGpuPreviewAllocation(scene, dimensions, 2);
  const background = updateQuickEditBackground(scene.background, {
    enabled: true,
    type: 'image',
    assetId: 'image',
    layout: { padding: 0, cornerRadius: 0, blur: 0 },
    motion: { mode: 'drift', speed: 100, intensity: 100 },
  });
  if (!background.enabled || background.type !== 'image')
    throw new Error('Expected image background');
  // Compare against identical layout without motion: only the retained paint cache is new.
  const staticScene = {
    ...scene,
    background: { ...background, motion: { ...background.motion!, mode: 'none' as const } },
  };
  const staticPlan = reviewGpuPreviewAllocation(staticScene, dimensions, 2);
  const moving = reviewGpuPreviewAllocation({ ...scene, background }, dimensions, 2);
  expect(moving.maximumManagedBytes - staticPlan.maximumManagedBytes).toBe(2 * 320 * 180 * 4);
  expect(moving.maximumCanvases - staticPlan.maximumCanvases).toBe(2);
  const blurred = reviewGpuPreviewAllocation(
    { ...scene, background: { ...background, layout: { ...background.layout, blur: 10 } } },
    dimensions,
    2
  );
  // Blur at backing density is 5px; Gaussian support adds ceil(3*5)+2 on every side.
  expect(blurred.maximumManagedBytes - moving.maximumManagedBytes).toBe(
    2 * (2 * 320 * 180 * 4 + 354 * 214 * 4)
  );
  expect(blurred.maximumCanvases - moving.maximumCanvases).toBe(6);
  expect(plain.maximumManagedBytes).toBeGreaterThan(0);
});

it('budgets dense-gradient pixel storage and clamps each high-resolution motion cache', () => {
  const image = updateQuickEditBackground(scene.background, {
    enabled: true,
    type: 'image',
    assetId: 'image',
    layout: { padding: 0, cornerRadius: 0, blur: 0 },
  });
  const gradient = updateQuickEditBackground(image, { type: 'gradient' });
  const imagePlan = reviewGpuPreviewAllocation({ ...scene, background: image }, dimensions, 2);
  const gradientPlan = reviewGpuPreviewAllocation(
    { ...scene, background: gradient },
    dimensions,
    2
  );
  expect(gradientPlan.maximumManagedBytes - imagePlan.maximumManagedBytes).toBe(
    2 * (320 * 180 * 4 * 2 + 4097 * 4)
  );
  expect(gradientPlan.maximumCanvases - imagePlan.maximumCanvases).toBe(2);
  const large = {
    canonical: { width: 4096, height: 2048 },
    backing: { width: 4096, height: 2048 },
  };
  const staticPlan = reviewGpuPreviewAllocation({ ...scene, background: image }, large, 2);
  const moving = updateQuickEditBackground(image, {
    motion: { mode: 'drift', speed: 100, intensity: 100 },
  });
  const movingPlan = reviewGpuPreviewAllocation({ ...scene, background: moving }, large, 2);
  expect(movingPlan.maximumManagedBytes - staticPlan.maximumManagedBytes).toBe(2 * 2048 * 1024 * 4);
  expect(movingPlan.maximumCanvases - staticPlan.maximumCanvases).toBe(2);
});
