import { describe, expect, it } from 'vitest';
import {
  boundQuickEditCameraMotion,
  boundQuickEditCameraProjection,
} from './camera-projection-bounds';
import type { QuickEditCameraProjectionInterval } from './camera-projection-bounds';
import {
  createCameraTrajectory,
  evaluateCameraTrajectory,
  evaluateCameraTrajectoryDerivative,
} from '../../composition/motion/camera-trajectory';
import {
  computeQuickEditVideoTransform,
  computeQuickEditSpatialWindow,
  computeQuickEditSpatialRasterLayout,
} from './scene';
import { interpolateQuickEditSpatial } from './spatial';
import { projectQuickEditPoint, quickEditPlaneProjection } from './spatial-geometry';
import { createQuickEditZoomRegion } from './zoom';

const base: QuickEditCameraProjectionInterval = {
  start: 0,
  end: 1,
  window: { x: 40, y: 30, width: 800, height: 500 },
  video: { x: 40, y: 80, width: 800, height: 450 },
  output: { width: 1000, height: 600 },
  cornerRadius: 20,
  targetScale: 2,
  phase: 1,
  pan: { minX: 360, maxX: 360, minY: 200, maxY: 200 },
  windowWeight: 'window',
  perspective: { rotateX: 25, rotateY: -20, rotateZ: 15, strength: 0.7 },
  actual: { from: { x: 0.55, y: 0.5 }, to: { x: 0.55, y: 0.5 } },
};

describe('real camera projection interval bounds', () => {
  it('includes screen motion from authored zoom even when the working-zone pan is held', () => {
    const phase = createCameraTrajectory({
      start: 0,
      end: 0.1,
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      fromAcceleration: { x: 600, y: 0 },
      toAcceleration: { x: -600, y: 0 },
    });
    const bounds = boundQuickEditCameraMotion({
      ...base,
      start: 0.05,
      end: 0.05,
      window: { x: 0, y: 0, width: 1000, height: 600 },
      video: { x: 0, y: 0, width: 1000, height: 600 },
      pan: { minX: 1000, maxX: 1000, minY: 600, maxY: 600 },
      phase,
      perspective: { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0 },
    })!;
    expect(bounds.speed).toBeGreaterThanOrEqual(0.45 * 15 * Math.hypot(1000, 600));
  });
  it('matches the shared renderer projection with header, padding, tilt, and partial window motion', () => {
    for (const windowWeight of ['window', 'content', 'spatial'] as const) {
      for (const phase of [0.2, 0.6, 1]) {
        const input = { ...base, start: phase, end: phase, phase, windowWeight };
        const spatial = interpolateQuickEditSpatial(
          null,
          {
            ...createQuickEditZoomRegion({ id: 'camera', at: 0 }),
            perspective: { enabled: true, ...base.perspective },
          },
          phase
        );
        const scale = 1 + (base.targetScale - 1) * phase;
        const camera = {
          scale,
          centerX: ((base.pan.minX * phase) / base.window.width + 0.5) / scale,
          centerY: ((base.pan.minY * phase) / base.window.height + 0.5) / scale,
          spatial,
        };
        const background = {
          enabled: true as const,
          type: 'solid' as const,
          color: '#000000',
          zoomBehavior: windowWeight === 'spatial' ? ('fixed' as const) : windowWeight,
          layout: { padding: 40, cornerRadius: 20 },
        };
        const layout = {
          windowRect: base.window,
          videoRect: base.video,
          contentRect: base.window,
          spatial,
          videoTransform: computeQuickEditVideoTransform({
            windowRect: base.window,
            videoRect: base.video,
            camera,
          }),
        };
        const raster = computeQuickEditSpatialRasterLayout(layout, background);
        const native = base.actual!.from;
        const point = {
          x: raster.videoTransform.x + native.x * raster.videoTransform.width,
          y: raster.videoTransform.y + native.y * raster.videoTransform.height,
        };
        const projected = projectQuickEditPoint(
          quickEditPlaneProjection(
            base.window,
            computeQuickEditSpatialWindow(layout, background),
            spatial
          ),
          point
        )!;
        const expectedClearance = Math.min(
          projected.x,
          projected.y,
          base.output.width - projected.x,
          base.output.height - projected.y
        );
        const bounds = boundQuickEditCameraProjection(input)!;
        expect(bounds.viewport!.low).toBeLessThanOrEqual(expectedClearance + 1e-6);
        expect(bounds.viewport!.high).toBeGreaterThanOrEqual(expectedClearance - 1e-6);
        expect(bounds.viewport!.high - bounds.viewport!.low).toBeLessThan(1e-5);
      }
    }
  });

  it('checks rounded raster clipping even when the projected point lies inside the output', () => {
    const bounds = boundQuickEditCameraProjection({
      ...base,
      perspective: { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0 },
      pan: { minX: 0, maxX: 0, minY: 450, maxY: 450 },
      actual: { from: { x: 0, y: 1 }, to: { x: 0, y: 1 } },
    })!;
    expect(bounds.viewport!.low).toBeGreaterThan(0);
    expect(bounds.raster!.high).toBeLessThan(0);
  });

  it('bounds every screen derivative of a held-phase moving window without adding nominal zoom motion', () => {
    const trajectory = createCameraTrajectory({
      start: 0,
      end: 1,
      from: { x: 200, y: 100 },
      to: { x: 600, y: 200 },
    });
    for (let index = 0; index < 20; index++) {
      const time = index / 20;
      const bounds = boundQuickEditCameraMotion({
        ...base,
        trajectory,
        start: time,
        end: time + 0.05,
      })!;
      for (const [key, order] of [
        ['speed', 1],
        ['acceleration', 2],
        ['jerk', 3],
      ] as const) {
        const derivative = evaluateCameraTrajectoryDerivative(trajectory, time + 0.025, order);
        expect(bounds[key]).toBeGreaterThanOrEqual(Math.hypot(derivative.x, derivative.y) - 1e-6);
      }
    }
    expect(boundQuickEditCameraMotion(base)!.speed).toBeLessThan(1e-6);
  });

  it('includes cross derivatives between an entering nominal zoom and follow pan', () => {
    const trajectory = createCameraTrajectory({
      start: 0,
      end: 1,
      from: { x: 200, y: 100 },
      to: { x: 600, y: 200 },
    });
    const phase = createCameraTrajectory({
      start: 0,
      end: 1,
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      fromVelocity: { x: 1, y: 0 },
      toVelocity: { x: 1, y: 0 },
    });
    const perspective = { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0 };
    const time = 0.5;
    const bounds = boundQuickEditCameraMotion({
      ...base,
      trajectory,
      phase,
      perspective,
      start: time,
      end: time,
    })!;
    const p = evaluateCameraTrajectory(trajectory, time);
    const v = evaluateCameraTrajectoryDerivative(trajectory, time, 1);
    const a = evaluateCameraTrajectoryDerivative(trajectory, time, 2);
    const j = evaluateCameraTrajectoryDerivative(trajectory, time, 3);
    for (const point of [
      { x: 0, y: 50 },
      { x: 800, y: 50 },
      { x: 0, y: 500 },
      { x: 800, y: 500 },
    ])
      expect(bounds.speed).toBeGreaterThanOrEqual(
        Math.hypot(point.x - p.x - time * v.x, point.y - p.y - time * v.y) - 1e-6
      );
    expect(bounds.acceleration).toBeCloseTo(
      Math.hypot(time * a.x + 2 * v.x, time * a.y + 2 * v.y),
      4
    );
    expect(bounds.jerk).toBeCloseTo(Math.hypot(time * j.x + 3 * a.x, time * j.y + 3 * a.y), 4);
    expect(evaluateCameraTrajectory(phase, time).x).toBeCloseTo(time);
  });
});
