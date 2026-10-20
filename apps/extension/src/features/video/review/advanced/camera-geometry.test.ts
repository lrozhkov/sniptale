import { expect, it } from 'vitest';
import {
  createReviewCameraLinkGeometry,
  createReviewWorkingZoneCameraGeometry,
} from './camera-geometry';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSpatialWindow,
  computeQuickEditSpatialRasterLayout,
  evaluateQuickEditCameraAtTime,
} from './scene';
import {
  projectQuickEditPoint,
  quickEditPlaneProjection,
} from '../../composition/motion/spatial-geometry';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { createQuickEditZoomRegion } from './zoom';
import {
  createCameraFollowSettings,
  resolveCameraFollowPolicy,
} from '../../project/camera/cursor-policy';
import { planWorkingZoneCamera } from '../../composition/motion/follow-cursor';

const source = { width: 1200, height: 700 };
const output = { width: 1280, height: 800 };
const policy = resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') });
const background = {
  enabled: true as const,
  type: 'solid' as const,
  color: '#000000',
  zoomBehavior: 'window' as const,
  layout: { padding: 30, cornerRadius: 20 },
};
const region = {
  ...createQuickEditZoomRegion({ id: 'camera', at: 0, duration: 3 }),
  transform: { scale: 1.2, centerX: 0.58, centerY: 0.5 },
  enter: { type: 'ease-in-out' as const, duration: 0.6 },
  exit: { type: 'ease-in-out' as const, duration: 0.6 },
};
const base = computeQuickEditSceneLayout({
  source,
  output,
  background,
  windowHeader: DEFAULT_WINDOW_HEADER,
  camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
});

it.each(['window', 'content', 'fixed'] as const)(
  'uses the renderer nominal phase and projection in %s scenes',
  (zoomBehavior) => {
    const selected = {
      ...region,
      perspective: { enabled: true, rotateX: 20, rotateY: -15, rotateZ: 15, strength: 0.5 },
    };
    const sceneBackground = { ...background, zoomBehavior };
    const geometry = createReviewWorkingZoneCameraGeometry({
      output,
      background: sceneBackground,
      window: base.windowRect,
      video: base.videoRect,
      cornerRadius: 20,
      region: selected,
      topology: [selected],
      policy,
    });
    for (const time of [0.1, 0.3, 0.6, 1.5, 2.4, 2.7, 2.9]) {
      const camera = evaluateQuickEditCameraAtTime([selected], time);
      const layout = computeQuickEditSceneLayout({
        source,
        output,
        background: sceneBackground,
        windowHeader: DEFAULT_WINDOW_HEADER,
        camera,
      });
      const raster = computeQuickEditSpatialRasterLayout(layout, sceneBackground);
      const native = { x: 0.57, y: 0.5 };
      const point = {
        x: raster.videoTransform.x + native.x * raster.videoTransform.width,
        y: raster.videoTransform.y + native.y * raster.videoTransform.height,
      };
      const projected = projectQuickEditPoint(
        quickEditPlaneProjection(
          layout.windowRect,
          computeQuickEditSpatialWindow(layout, sceneBackground),
          camera.spatial!
        ),
        point
      )!;
      const pan = {
        x: (selected.transform.centerX * selected.transform.scale - 0.5) * base.windowRect.width,
        y: (selected.transform.centerY * selected.transform.scale - 0.5) * base.windowRect.height,
      };
      const bounds = geometry.clearanceBounds({
        start: time,
        end: time,
        segmentId: 'source',
        targetScale: selected.transform.scale,
        pan: { minX: pan.x, maxX: pan.x, minY: pan.y, maxY: pan.y },
        actual: { from: native, to: native },
      })!;
      const clearance = Math.min(
        projected.x,
        projected.y,
        output.width - projected.x,
        output.height - projected.y
      );
      expect(bounds.viewport!.low).toBeCloseTo(clearance, 5);
      expect(bounds.viewport!.high).toBeCloseTo(clearance, 5);
    }
  }
);

it('admits a held activity center throughout authored entry and exit using actual decorated layout', () => {
  const geometry = createReviewWorkingZoneCameraGeometry({
    output,
    background,
    window: base.windowRect,
    video: base.videoRect,
    cornerRadius: 20,
    region,
    topology: [region],
    policy,
  });
  const frames = Array.from({ length: 31 }, (_, index) => ({
    time: index / 10,
    x: 0.57,
    y: 0.5,
    actual: { x: 0.57, y: 0.5 },
    segmentId: 'source',
  }));
  const plan = planWorkingZoneCamera({
    frames,
    start: 0,
    end: 3,
    targetScale: region.transform.scale,
    policy,
    geometry,
  });
  expect(plan.status).toBe('ready');
  if (plan.status === 'ready') expect(plan.spans).toHaveLength(1);
});

it('admits authored zoom toward a held off-center zone independently of follow speed', () => {
  const calm = resolveCameraFollowPolicy({
    defaults: {
      ...createCameraFollowSettings('calm'),
      transitionDuration: 1.5,
      minimumScale: 1.35,
    },
  });
  const selected = {
    ...region,
    transform: { scale: 2, centerX: 0.75, centerY: 0.75 },
    enter: { type: 'ease-in-out' as const, duration: 0.3 },
  };
  const geometry = createReviewWorkingZoneCameraGeometry({
    output,
    background,
    window: base.windowRect,
    video: base.videoRect,
    cornerRadius: 20,
    region: selected,
    topology: [selected],
    policy: calm,
  });
  const frames = [0, 1, 2, 3].map((time) => ({ time, x: 0.75, y: 0.75, segmentId: 'source' }));
  expect(
    planWorkingZoneCamera({ frames, start: 0, end: 3, targetScale: 2, policy: calm, geometry })
  ).toMatchObject({ status: 'ready' });
});

it('preserves disabled entry/exit phases for linked source cameras', () => {
  const previous = { ...region, id: 'previous', start: 0, end: 3, linkTo: 'next' };
  const next = { ...region, id: 'next', start: 4, end: 7 };
  const geometry = createReviewWorkingZoneCameraGeometry({
    output,
    background,
    window: base.windowRect,
    video: base.videoRect,
    cornerRadius: 20,
    region: next,
    topology: [previous, next],
    policy,
  });
  expect(geometry.breaks).not.toContain(next.start + next.enter.duration);
  expect(geometry.breaks).toContain(next.end - next.exit.duration);
});

it.each(['window', 'content', 'fixed'] as const)(
  'matches the real combined-angle link projection in %s scenes',
  (zoomBehavior) => {
    const from = {
      ...region,
      id: 'from',
      start: 0,
      end: 1,
      linkTo: 'to',
      transform: { scale: 1.2, centerX: 0.55, centerY: 0.5 },
      perspective: { enabled: true, rotateX: 20, rotateY: -15, rotateZ: 170, strength: 0.5 },
    };
    const to = {
      ...region,
      id: 'to',
      start: 3,
      end: 4,
      transform: { scale: 1.5, centerX: 0.6, centerY: 0.5 },
      perspective: { enabled: true, rotateX: -10, rotateY: 20, rotateZ: -170, strength: 0.3 },
    };
    const sceneBackground = { ...background, zoomBehavior };
    const pan = (camera: typeof from.transform) => ({
      x: (camera.centerX * camera.scale - 0.5) * base.windowRect.width,
      y: (camera.centerY * camera.scale - 0.5) * base.windowRect.height,
    });
    const targetPan = pan(to.transform);
    const { geometry } = createReviewCameraLinkGeometry({
      output,
      background: sceneBackground,
      window: base.windowRect,
      video: base.videoRect,
      cornerRadius: 20,
      topology: [from, to],
      policy,
      from: { region: from, scale: from.transform.scale, pan: pan(from.transform) },
      to: { region: to, scale: to.transform.scale, pan: targetPan },
    });
    for (const time of [1, 1.25, 2, 2.75, 3]) {
      const camera = evaluateQuickEditCameraAtTime([from, to], time);
      const layout = computeQuickEditSceneLayout({
        source,
        output,
        background: sceneBackground,
        windowHeader: DEFAULT_WINDOW_HEADER,
        camera,
      });
      const raster = computeQuickEditSpatialRasterLayout(layout, sceneBackground);
      const native = { x: 0.57, y: 0.5 };
      const point = {
        x: raster.videoTransform.x + native.x * raster.videoTransform.width,
        y: raster.videoTransform.y + native.y * raster.videoTransform.height,
      };
      const projected = projectQuickEditPoint(
        quickEditPlaneProjection(
          layout.windowRect,
          computeQuickEditSpatialWindow(layout, sceneBackground),
          camera.spatial!
        ),
        point
      )!;
      const bounds = geometry.clearanceBounds({
        start: time,
        end: time,
        segmentId: 'source',
        targetScale: to.transform.scale,
        pan: { minX: targetPan.x, maxX: targetPan.x, minY: targetPan.y, maxY: targetPan.y },
        actual: { from: native, to: native },
      })!;
      const clearance = Math.min(
        projected.x,
        projected.y,
        output.width - projected.x,
        output.height - projected.y
      );
      expect(bounds.viewport!.low).toBeCloseTo(clearance, 5);
      expect(bounds.viewport!.high).toBeCloseTo(clearance, 5);
    }
  }
);

it.each([1.2, 2, 2.5])(
  'admits nominal zoom %s with decorated entry/exit and retains source facts',
  (targetScale) => {
    const selected = { ...region, transform: { ...region.transform, scale: targetScale } };
    const geometry = createReviewWorkingZoneCameraGeometry({
      output,
      background,
      window: base.windowRect,
      video: base.videoRect,
      cornerRadius: 20,
      region: selected,
      topology: [selected],
      policy,
    });
    const frames = [0, 1, 2, 3].map((time) => ({
      time,
      x: 0.57,
      y: 0.5,
      actual: { x: 0.57, y: 0.5 },
      segmentId: 'source',
    }));
    const before = structuredClone(frames);
    const plan = planWorkingZoneCamera({ frames, start: 0, end: 3, targetScale, policy, geometry });
    expect(plan).toMatchObject({ status: 'ready', targetScale });
    expect(frames).toEqual(before);
  }
);
