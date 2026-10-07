import { expect, it } from 'vitest';
import {
  quickEditPlaneProjection,
  invertQuickEditProjection,
  projectQuickEditPoint,
} from './spatial-geometry';
import { quickEditSpatialTargetCamera, DEFAULT_QUICK_EDIT_PERSPECTIVE } from './spatial';
import { createQuickEditZoomRegion } from './zoom';

it('projects identity and inverse points without losing the decorated header coordinates', () => {
  const base = { x: 80, y: 30, width: 900, height: 600 };
  const target = { x: -200, y: -100, width: 1800, height: 1200 };
  for (const rotateX of [-60, 0, 60])
    for (const rotateY of [-60, 0, 60]) {
      const region = {
        ...createQuickEditZoomRegion({ id: 'z', at: 0 }),
        perspective: {
          ...DEFAULT_QUICK_EDIT_PERSPECTIVE,
          enabled: true,
          rotateX,
          rotateY,
          strength: 1,
        },
      };
      const matrix = quickEditPlaneProjection(
        base,
        target,
        quickEditSpatialTargetCamera(region).spatial!
      );
      const inverse = invertQuickEditProjection(matrix)!;
      for (const point of [
        { x: 80, y: 30 },
        { x: 980, y: 630 },
        { x: 350, y: 300 },
      ]) {
        const projected = projectQuickEditPoint(matrix, point)!;
        expect(Number.isFinite(projected.x)).toBe(true);
        const restored = projectQuickEditPoint(inverse, projected)!;
        expect(restored.x).toBeCloseTo(point.x, 6);
        expect(restored.y).toBeCloseTo(point.y, 6);
      }
    }
});

it('ordinary zoom endpoint retains its original crop while the background remains locked', async () => {
  const {
    computeQuickEditSceneLayout,
    computeQuickEditSpatialWindow,
    computeQuickEditSpatialRasterLayout,
  } = await import('./scene');
  const region = createQuickEditZoomRegion({ id: 'plain', at: 0 });
  const spatial = {
    rotation: [0, 0, 0, 1] as const,
    perspective: 0,
    windowMotion: 0,
    lockBackground: true,
    focus: [],
  };
  const background = {
    enabled: true as const,
    type: 'solid' as const,
    color: '#000000',
    zoomBehavior: 'follow-video' as const,
    layout: { padding: 30, cornerRadius: 12 },
  };
  const layout = computeQuickEditSceneLayout({
    output: { width: 800, height: 450 },
    source: { width: 800, height: 450 },
    background,
    camera: { ...region.transform, spatial },
  });
  expect(computeQuickEditSpatialWindow(layout, background)).toEqual(layout.windowRect);
  expect(computeQuickEditSpatialRasterLayout(layout, background).videoTransform).toEqual(
    layout.videoTransform
  );
});

it('keeps the entire transition front-facing between the strongest supported tilts', async () => {
  const { interpolateQuickEditSpatial } = await import('./spatial');
  const { quickEditRotationMatrix } = await import('./spatial-geometry');
  const poses = [];
  for (const rotateX of [-60, 60])
    for (const rotateY of [-60, 60])
      for (const rotateZ of [-180, 0, 180])
        poses.push({
          ...createQuickEditZoomRegion({ id: 'pose', at: 0 }),
          perspective: {
            ...DEFAULT_QUICK_EDIT_PERSPECTIVE,
            enabled: true,
            rotateX,
            rotateY,
            rotateZ,
          },
        });
  for (const from of poses)
    for (const to of poses)
      for (const t of [0, 0.25, 0.5, 0.75, 1])
        expect(
          quickEditRotationMatrix(interpolateQuickEditSpatial(from, to, t).rotation)[8]
        ).toBeGreaterThanOrEqual(0.249999);
});

it('rejects a degenerate inverse or a point behind the camera', () => {
  expect(invertQuickEditProjection([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  expect(projectQuickEditPoint([1, 0, 0, 0, 1, 0, 0, 0, -1], { x: 2, y: 3 })).toBeNull();
  expect(projectQuickEditPoint([1, 0, 0, 0, 1, 0, 0, 0, Infinity], { x: 2, y: 3 })).toBeNull();
});
