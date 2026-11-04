import { expect, it } from 'vitest';
import { reviewPresentedGeometry, reviewPresentedStageProjection } from './gpu-preview-geometry';
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
