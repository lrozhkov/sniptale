import { createWindowCameraLinkGeometry } from './window-camera-geometry';
import { motionWindowFocusToComposition } from './source-window';
import { mapCompositionPointThroughCamera } from './index';
import { resolveProjectCursorCameraPlan } from './project-follow';
import { motionCameraProjection } from './spatial';
import { projectQuickEditPoint } from './spatial-geometry';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import {
  type VideoProjectMotionRegion,
  VideoCursorCaptureMode,
  VideoMediaFitMode,
  VideoMotionFocusMode,
  VideoTemporalEasing,
  VideoTransitionKind,
} from '../../project/types';
import { normalizeVideoProjectCursorSkin } from '../../project/cursor';
import { createProjectWorkingZoneCameraGeometry } from './camera-geometry';
import {
  createCameraFollowSettings,
  resolveCameraFollowPolicy,
} from '../../project/camera/cursor-policy';
import { resolveVideoCompositionCamera } from './index';
import {
  boundRenderedCursorPosition,
  resolveVideoCompositionCursor,
} from '../timeline/frame/cursor';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'geometry',
    filename: 'geometry.webm',
    width: 100,
    height: 100,
    duration: 3,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: VideoCursorCaptureMode.SEPARATE,
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        {
          id: 'from',
          time: 0,
          x: 20,
          y: 50,
          visible: true,
          recordingPoint: { x: 0.2, y: 0.5 },
          captureSegment: 0,
        },
        {
          id: 'to',
          time: 1,
          x: 80,
          y: 50,
          visible: true,
          recordingPoint: { x: 0.8, y: 0.5 },
          captureSegment: 0,
        },
      ],
    },
  });
  const region: VideoProjectMotionRegion & { focusPoint: { x: number; y: number } } = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 3,
    scale: 2,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 60, y: 50 },
    zoomInDuration: 0.6,
    zoomOutDuration: 0.6,
  };
  project.motionRegions = [region];
  const policy = resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('fast') });
  return { project, region, policy };
}

it.each([
  VideoTemporalEasing.LINEAR,
  VideoTemporalEasing.EASE_OUT,
  VideoTemporalEasing.EASE_IN_OUT,
  VideoTemporalEasing.INSTANT,
])(
  'matches the actual camera phase in %s easing, including a retained animation clock',
  (easing) => {
    const { project, region, policy } = fixture();
    const selected = { ...region, easing, animation: { start: 0.2, end: 2.8, duration: 3 } };
    project.motionRegions = [selected];
    const geometry = createProjectWorkingZoneCameraGeometry({
      project,
      region: selected,
      policy,
      connectedIn: false,
      connectedOut: false,
      bindings: new Map([['source', {}]]),
    });
    const pan = {
      x: selected.focusPoint.x * selected.scale - project.width / 2,
      y: selected.focusPoint.y * selected.scale - project.height / 2,
    };
    for (const time of [0.01, 0.2, 0.4, 1, 2.6, 2.9]) {
      const camera = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const point = { x: 0.58, y: 0.5 };
      const x = (point.x * project.width - camera.viewportX) * camera.scale;
      const y = (point.y * project.height - camera.viewportY) * camera.scale;
      const clearance = Math.min(x, y, project.width - x, project.height - y);
      const bounds = geometry.clearanceBounds({
        start: time,
        end: time,
        segmentId: 'source',
        targetScale: selected.scale,
        pan: { minX: pan.x, maxX: pan.x, minY: pan.y, maxY: pan.y },
        actual: { from: point, to: point },
      })!;
      expect(bounds.viewport!.low).toBeCloseTo(clearance, 7);
      expect(bounds.viewport!.high).toBeCloseTo(clearance, 7);
    }
  }
);

it.each(['none', 'linear', 'ease-in-out', 'ease-out', 'instant'] as const)(
  'matches the actual authored %s phase with retained clocks',
  (type) => {
    const { project, region, policy } = fixture();
    const selected = {
      ...region,
      phaseTransitions: { enter: type, exit: type },
      animation: { start: 0.2, end: 2.8, duration: 3 },
    };
    project.motionRegions = [selected];
    const geometry = createProjectWorkingZoneCameraGeometry({
      project,
      region: selected,
      policy,
      connectedIn: false,
      connectedOut: false,
      bindings: new Map([['source', {}]]),
    });
    const pan = {
      x: selected.focusPoint.x * selected.scale - project.width / 2,
      y: selected.focusPoint.y * selected.scale - project.height / 2,
    };
    for (const time of [0.01, 0.2, 0.4, 1, 2.6, 2.9]) {
      const camera = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const point = { x: 0.58, y: 0.5 };
      const x = (point.x * project.width - camera.viewportX) * camera.scale;
      const y = (point.y * project.height - camera.viewportY) * camera.scale;
      const clearance = Math.min(x, y, project.width - x, project.height - y);
      const bounds = geometry.clearanceBounds({
        start: time,
        end: time,
        segmentId: 'source',
        targetScale: selected.scale,
        pan: { minX: pan.x, maxX: pan.x, minY: pan.y, maxY: pan.y },
        actual: { from: point, to: point },
      })!;
      expect(bounds.viewport!.low).toBeCloseTo(clearance, 7);
      expect(bounds.viewport!.high).toBeCloseTo(clearance, 7);
    }
  }
);

it.each([false, true])(
  'retains source crop failure before local rotation and perspective=%s',
  (perspective) => {
    const { project, region, policy } = fixture();
    const clip = project.clips[0]!;
    project.width = 300;
    project.height = 300;
    if (clip.type !== 'VIDEO') throw new Error('Video fixture is required.');
    clip.transform = { ...clip.transform, x: 100, y: 100, width: 100, height: 100, rotation: 180 };
    clip.fitMode = VideoMediaFitMode.COVER;
    project.assets[0]!.metadata.height = 50;
    const geometry = createProjectWorkingZoneCameraGeometry({
      project,
      region: {
        ...region,
        zoomInDuration: 0,
        zoomOutDuration: 0,
        ...(perspective
          ? {
              perspective: { enabled: true, rotateX: 0, rotateY: 15, rotateZ: 0, strength: 0.7 },
              spatialReference: { x: 0.1, y: 0.1, width: 0.7, height: 0.7 },
            }
          : {}),
      },
      policy,
      connectedIn: false,
      connectedOut: false,
      bindings: new Map([['source', { focusClipId: clip.id, actualClipId: clip.id }]]),
    });
    const point = { x: 0.1, y: 0.5 };
    const bounds = geometry.clearanceBounds({
      start: 1,
      end: 1,
      segmentId: 'source',
      targetScale: 2,
      pan: { minX: 300, maxX: 300, minY: 150, maxY: 150 },
      actual: { from: point, to: point },
    })!;
    expect(bounds.raster!.high).toBeLessThan(0);
    expect(bounds.viewport!.low).toBeGreaterThan(0);
  }
);

it('bounds the real editable cursor curve instead of a linear approximation between preview samples', () => {
  const { project, region, policy } = fixture();
  project.cursorTrack!.samples[0]!.interpolation = VideoTemporalEasing.EASE_OUT;
  const bounds = boundRenderedCursorPosition(project, 0.25, 0.5)!;
  for (const time of [0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) {
    const actual = resolveVideoCompositionCursor(project, time, [])!;
    expect(actual.x).toBeGreaterThanOrEqual(bounds.minX - 1e-9);
    expect(actual.x).toBeLessThanOrEqual(bounds.maxX + 1e-9);
  }
  const geometry = createProjectWorkingZoneCameraGeometry({
    project,
    region: { ...region, zoomInDuration: 0, zoomOutDuration: 0 },
    policy,
    connectedIn: false,
    connectedOut: false,
    bindings: new Map([['rendered', { renderedCursor: true }]]),
  });
  const proof = geometry.clearanceBounds({
    start: 0.25,
    end: 0.5,
    segmentId: 'rendered',
    targetScale: 2,
    preservePointer: true,
    pan: { minX: 20, maxX: 20, minY: 50, maxY: 50 },
  })!;
  expect(proof.viewport!.low).toBeLessThan(0);
});

it('does not invent a rendered cursor constraint when its skin is hidden', () => {
  const { project, region, policy } = fixture();
  project.cursorTrack!.skin.hidden = true;
  const geometry = createProjectWorkingZoneCameraGeometry({
    project,
    region: { ...region, zoomInDuration: 0, zoomOutDuration: 0 },
    policy,
    connectedIn: false,
    connectedOut: false,
    bindings: new Map([['hidden', { renderedCursor: true }]]),
  });
  expect(
    geometry.clearanceBounds({
      start: 0.25,
      end: 0.5,
      segmentId: 'hidden',
      targetScale: 2,
      preservePointer: true,
      pan: { minX: 20, maxX: 20, minY: 50, maxY: 50 },
    })
  ).not.toHaveProperty('viewport');
});

it('keeps held-zone follow motion zero during authored zoom at both output sizes', () => {
  const { project, region, policy } = fixture();
  const make = (factor: number) =>
    createProjectWorkingZoneCameraGeometry({
      project,
      region,
      policy,
      connectedIn: false,
      connectedOut: false,
      bindings: new Map(),
      output: { width: project.width * factor, height: project.height * factor },
    });
  const original = make(1).motionBounds({
    start: 0.1,
    end: 0.2,
    targetScale: 2,
    pan: { minX: 50, maxX: 50, minY: 50, maxY: 50 },
  })!;
  const doubled = make(2).motionBounds({
    start: 0.1,
    end: 0.2,
    targetScale: 2,
    pan: { minX: 100, maxX: 100, minY: 100, maxY: 100 },
  })!;
  expect(original).toEqual({ speed: 0, acceleration: 0, jerk: 0 });
  expect(doubled.speed).toBeCloseTo(original.speed * 2, 6);
  expect(doubled.acceleration).toBeCloseTo(original.acceleration * 2, 6);
});

it('advertises the actual retained animation boundaries against the outside identity camera', () => {
  const { project, region, policy } = fixture();
  const selected = { ...region, animation: { start: 0.2, end: 2.8, duration: 3 } };
  const geometry = createProjectWorkingZoneCameraGeometry({
    project,
    region: selected,
    policy,
    connectedIn: false,
    connectedOut: false,
    bindings: new Map(),
  });
  expect(geometry.discontinuities?.(selected.scale)).toEqual(expect.arrayContaining([0, 3]));
});

it('retains phase cross acceleration for a moving follow pan during linear zoom', () => {
  const { project, region, policy } = fixture();
  const geometry = createProjectWorkingZoneCameraGeometry({
    project,
    region: { ...region, easing: VideoTemporalEasing.LINEAR },
    policy,
    connectedIn: false,
    connectedOut: false,
    bindings: new Map(),
  });
  const motion = geometry.motionBounds({
    start: 0.2,
    end: 0.2,
    targetScale: 2,
    pan: { minX: 6, maxX: 6, minY: 8, maxY: 8 },
    trajectory: {
      start: 0,
      end: 1,
      controls: Array.from({ length: 6 }, (_, index) => ({ x: index * 6, y: index * 8 })),
    },
  })!;
  // Linear pan has speed 50; the .6-second zoom phase contributes 2 * phase' * pan'.
  expect(motion.speed).toBeCloseTo(50 / 3, 6);
  expect(motion.acceleration).toBeCloseTo(100 / 0.6, 6);
  expect(motion.jerk).toBeCloseTo(0, 6);
});

it('bounds the original eased source cursor at recursive proof interval edges', () => {
  const { project, region, policy } = fixture();
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source');
  clip.transform = { ...clip.transform, x: 10, y: 20, width: 80, height: 60 };
  clip.fitMode = 'STRETCH';
  clip.sourceCrop = { x: 0.1, y: 0, width: 0.8, height: 1 };
  project.cursorTrack!.samples[0]!.interpolation = VideoTemporalEasing.EASE_OUT;
  const geometry = createProjectWorkingZoneCameraGeometry({
    project,
    region: { ...region, zoomInDuration: 0, zoomOutDuration: 0 },
    policy,
    connectedIn: false,
    connectedOut: false,
    bindings: new Map([['source', { actualClipId: clip.id, sourceCursor: true }]]),
  });
  const bounds = geometry.clearanceBounds({
    start: 0.25,
    end: 0.5,
    segmentId: 'source',
    targetScale: 2,
    pan: { minX: 30, maxX: 30, minY: 30, maxY: 30 },
    actual: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
  })!;
  for (const time of [0.25, 0.3, 0.4, 0.5]) {
    const cursor = resolveVideoCompositionCursor(project, time, [])!;
    const clearance = Math.min(
      cursor.x * 2 - 30,
      cursor.y * 2 - 30,
      100 - (cursor.x * 2 - 30),
      100 - (cursor.y * 2 - 30)
    );
    expect(clearance).toBeGreaterThanOrEqual(bounds.viewport!.low - 1e-9);
    expect(clearance).toBeLessThanOrEqual(bounds.viewport!.high + 1e-9);
  }
});

it.each(['PUSH', 'SLIDE'] as const)(
  'bounds changing camera sizes during a %s transition',
  async (kind) => {
    const { resolveCursorSourcePointMapping, mapCursorFocusControlPoint } =
      await import('../timeline/frame/cursor');
    const { project, region, policy } = fixture();
    const clip = project.clips[0]!;
    if (clip.type !== 'VIDEO') throw new Error('Missing source');
    project.width = 300;
    project.height = 300;
    project.duration = 6;
    project.tracks = project.tracks.map((track) =>
      track.id === clip.trackId ? { ...track, role: 'CAMERA' } : track
    );
    project.cursorTrack!.samples = project.cursorTrack!.samples.map((sample) => ({
      ...sample,
      recordingPoint: { x: 0.5, y: 0.5 },
      x: 150,
      y: 150,
    }));
    clip.transform = { x: 20, y: 30, width: 80, height: 80, rotation: -20, opacity: 1 };
    clip.fitMode = 'STRETCH';
    clip.sourceCrop = { x: 0.2, y: 0.1, width: 0.6, height: 0.8 };
    clip.cameraAppearance = { shape: 'circle', roundness: 0, zoom: 1.2, panX: 0, panY: 0 };
    clip.cameraMirrored = true;
    clip.cameraPositions = [
      {
        id: 'moving',
        sourceTime: 0,
        transform: { ...clip.transform, x: 60, width: 120, height: 60, rotation: 67 },
        fitMode: 'STRETCH',
        transition: { kind: 'shrink', duration: 3 },
        crop: { zoom: 2, panX: 0.2, panY: -0.1 },
      },
    ];
    project.clips = [
      clip,
      { ...clip, id: 'following', sourceInstanceId: 'following-instance', startTime: 3 },
    ];
    project.transitions = [
      {
        id: 'push',
        leadingClipId: clip.id,
        trailingClipId: 'following',
        kind,
        duration: 1,
        easing: 'LINEAR',
        direction: 'RIGHT',
      },
    ];
    const geometry = createProjectWorkingZoneCameraGeometry({
      project,
      region: { ...region, duration: 3, zoomInDuration: 0, zoomOutDuration: 0 },
      policy,
      connectedIn: false,
      connectedOut: false,
      bindings: new Map([
        ['source', { actualClipId: clip.id, focusClipId: clip.id, sourceCursor: true }],
      ]),
    });
    const point = { x: 0.5, y: 0.5 };
    const bounds = geometry.clearanceBounds({
      start: 2.6,
      end: 2.8,
      segmentId: 'source',
      targetScale: 2,
      pan: { minX: 60, maxX: 60, minY: 20, maxY: 20 },
      actual: { from: point, to: point },
    })!;
    expect(bounds.viewport).toBeDefined();
    for (let index = 0; index <= 40; index++) {
      const time = 2.6 + (0.2 * index) / 40;
      const mapping = resolveCursorSourcePointMapping(project, clip.id, time)!;
      const world = mapCursorFocusControlPoint(mapping, point);
      const x = world.x * 2 - 60,
        y = world.y * 2 - 20;
      const clearance = Math.min(x, y, 300 - x, 300 - y);
      expect(clearance).toBeGreaterThanOrEqual(bounds.viewport!.low - 1e-9);
      expect(clearance).toBeLessThanOrEqual(bounds.viewport!.high + 1e-9);
    }
  }
);

it('bounds rounded source corners conservatively while accepting an interior cursor path', () => {
  const { project, region, policy } = fixture();
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip) throw new Error('Expected video');
  clip.windowCornerRadius = 50;
  clip.fitMode = 'STRETCH';
  const geometry = createProjectWorkingZoneCameraGeometry({
    project,
    region,
    policy,
    connectedIn: false,
    connectedOut: false,
    bindings: new Map([['source', { focusClipId: clip.id, actualClipId: clip.id }]]),
  });
  const bounds = (point: { x: number; y: number }) =>
    geometry.clearanceBounds({
      start: 1,
      end: 1,
      segmentId: 'source',
      targetScale: 2,
      pan: { minX: 50, maxX: 50, minY: 50, maxY: 50 },
      actual: { from: point, to: point },
    })!;
  expect(bounds({ x: 0.01, y: 0.01 }).raster!.high).toBeLessThan(0);
  expect(bounds({ x: 0.5, y: 0.5 }).raster!.low).toBeGreaterThan(0);
});

it.each([
  { width: 100, height: 100 },
  { width: 160, height: 90 },
])(
  'proves the actual perspective plane independently of source raster and output $width×$height',
  (output) => {
    const { project, region, policy } = fixture();
    region.easing = VideoTemporalEasing.LINEAR;
    region.perspective = { enabled: true, rotateX: 25, rotateY: -35, rotateZ: 18, strength: 0.8 };
    region.spatialReference = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
    region.animation = { start: 0.2, end: 2.8, duration: 3 };
    const geometry = createProjectWorkingZoneCameraGeometry({
      project,
      region,
      policy,
      output,
      connectedIn: false,
      connectedOut: false,
      bindings: new Map([['source', {}]]),
    });
    const rasterScale = Math.min(output.width / 100, output.height / 100);
    const offset = {
      x: (output.width - 100 * rasterScale) / 2,
      y: (output.height - 100 * rasterScale) / 2,
    };
    const point = { x: 0.78, y: 0.35 };
    const pan = { x: 70 * rasterScale, y: 50 * rasterScale };
    const projectAt = (progress: number) => {
      const ax = (25 * progress * Math.PI) / 180,
        ay = (-35 * progress * Math.PI) / 180,
        az = (18 * progress * Math.PI) / 180;
      const sx = Math.sin(ax),
        cx = Math.cos(ax),
        sy = Math.sin(ay),
        cy = Math.cos(ay),
        sz = Math.sin(az),
        cz = Math.cos(az);
      const x = point.x * 100 - 45,
        y = point.y * 100 - 50;
      const z = -sy * x + cy * sx * y;
      const denominator = 1 - (0.7 * 0.8 * progress * z) / Math.hypot(70, 60);
      return {
        denominator,
        x:
          offset.x +
          rasterScale *
            (1 + progress) *
            (45 + (cz * cy * x + (cz * sy * sx - sz * cx) * y) / denominator),
        y:
          offset.y +
          rasterScale *
            (1 + progress) *
            (50 + (sz * cy * x + (sz * sy * sx + cz * cx) * y) / denominator),
      };
    };
    for (const time of [0.01, 0.2, 0.4, 1, 2.6, 2.9]) {
      const camera = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const progress = camera.scale - 1;
      const projected = projectAt(progress);
      const x = projected.x - progress * pan.x,
        y = projected.y - progress * pan.y;
      const clearance = Math.min(x, y, output.width - x, output.height - y);
      const proof = geometry.clearanceBounds({
        start: time,
        end: time,
        segmentId: 'source',
        targetScale: 2,
        pan: { minX: pan.x, maxX: pan.x, minY: pan.y, maxY: pan.y },
        actual: { from: point, to: point },
      })!;
      expect(proof.denominator.low).toBeCloseTo(projected.denominator, 7);
      expect(proof.denominator.high).toBeCloseTo(projected.denominator, 7);
      expect(proof.viewport!.low).toBeCloseTo(clearance, 7);
      expect(proof.viewport!.high).toBeCloseTo(clearance, 7);
      if (progress > 0) {
        const bounds = geometry.pointPanBounds!(
          { ...point, actual: point, time, segmentId: 'source' },
          2
        )!;
        expect(bounds.minX).toBeCloseTo(Math.max(0, (projected.x - output.width) / progress), 7);
        expect(bounds.maxX).toBeCloseTo(Math.min(100 * rasterScale, projected.x / progress), 7);
        expect(bounds.minY).toBeCloseTo(Math.max(0, (projected.y - output.height) / progress), 7);
        expect(bounds.maxY).toBeCloseTo(Math.min(100 * rasterScale, projected.y / progress), 7);
      }
    }
    const target = projectAt(1);
    expect(geometry.preferredPan({ ...point, time: 1, segmentId: 'source' }, 2)).toEqual({
      x: expect.closeTo(target.x - output.width / 2, 7),
      y: expect.closeTo(target.y - output.height / 2, 7),
    });
  }
);

it('admits a real perspective CURSOR plan and keeps the rendered observation visible without authoring writes', () => {
  const { project, region } = fixture();
  region.focusMode = VideoMotionFocusMode.CURSOR;
  region.zoomInDuration = 0;
  region.zoomOutDuration = 0;
  region.perspective = { enabled: true, rotateX: 15, rotateY: -35, rotateZ: 12, strength: 0.8 };
  region.spatialReference = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
  project.cursorTrack!.samples = project.cursorTrack!.samples.map((sample) => ({
    ...sample,
    x: 57,
    y: 50,
    recordingPoint: { x: 0.57, y: 0.5 },
  }));
  const before = structuredClone(project);
  const plan = resolveProjectCursorCameraPlan(project, region);
  expect(plan.status).toBe('ready');
  for (const currentTime of [2.9, 0.1, 1.5]) {
    const camera = resolveVideoCompositionCamera({
      project,
      currentTime,
      actions: [],
      cursorSample: null,
    });
    const point = projectQuickEditPoint(motionCameraProjection(camera)!, { x: 57, y: 50 })!;
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(100);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(100);
  }
  expect(resolveProjectCursorCameraPlan(project, region)).toBe(plan);
  expect(project).toEqual(before);
});

it.each(
  Object.values(VideoTransitionKind).flatMap((kind) =>
    (['LINEAR', 'EASE_IN_OUT'] as const).flatMap((easing) =>
      [false, true].map((trailing) => [kind, easing, trailing] as const)
    )
  )
)(
  'bounds the source-window affine during %s with %s easing and trailing=%s',
  (kind, easing, trailing) => {
    const { project, region, policy } = fixture();
    const clip = project.clips.find((item) => item.type === 'VIDEO')!;
    if (clip.type !== 'VIDEO') throw new Error('Missing source');
    clip.transform.rotation = 30;
    if (trailing) {
      project.clips = [
        { ...clip, id: 'previous-video', sourceInstanceId: 'previous-instance' },
        clip,
      ];
      clip.startTime = 2;
    } else {
      project.clips.push({
        ...clip,
        id: 'next-video',
        startTime: 2,
        sourceInstanceId: 'next-instance',
      });
    }
    project.duration = 5;
    project.transitions = [
      {
        id: 'moving-source',
        leadingClipId: trailing ? 'previous-video' : clip.id,
        trailingClipId: trailing ? clip.id : 'next-video',
        kind,
        duration: 1,
        intensity: 'BOLD',
        easing,
        direction: 'RIGHT',
      },
    ];
    const selected = {
      ...region,
      startTime: clip.startTime,
      focusPoint: { x: 50, y: 50 },
      zoomInDuration: 0,
      zoomOutDuration: 0,
      phaseTransitions: { enter: 'none' as const, exit: 'none' as const },
      sourceBinding: {
        clipId: clip.id,
        coordinateSpace: 'source-window' as const,
        sourceStart: 0,
        sourceEnd: 3,
        animation: { start: 0, end: 3, duration: 3 },
      },
    };
    project.motionRegions = [selected];
    const before = structuredClone(project);
    const geometry = createProjectWorkingZoneCameraGeometry({
      project,
      region: selected,
      policy,
      connectedIn: false,
      connectedOut: false,
      bindings: new Map([['source', { focusClipId: clip.id, actualClipId: clip.id }]]),
    });
    const point = { x: 0.6, y: 0.4 };
    for (const time of [2.01, 2.25, 2.5, 2.75, 2.9, 2.95, 2.99]) {
      const camera = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const physical = motionWindowFocusToComposition(
        project,
        selected,
        { x: point.x * project.width, y: point.y * project.height },
        time
      );
      const pixel = mapCompositionPointThroughCamera(physical, camera)!;
      const clearance = Math.min(
        pixel.x,
        pixel.y,
        project.width - pixel.x,
        project.height - pixel.y
      );
      const bounds = geometry.clearanceBounds({
        start: time,
        end: time,
        segmentId: 'source',
        targetScale: 2,
        pan: { minX: 50, maxX: 50, minY: 50, maxY: 50 },
        actual: { from: point, to: point },
      })!;
      expect(bounds.viewport!.low).toBeLessThanOrEqual(clearance + 1e-6);
      expect(bounds.viewport!.high).toBeGreaterThanOrEqual(clearance - 1e-6);
    }
    const edges = [...new Set(geometry.breaks.filter((time) => time >= 2 && time <= 3))].sort(
      (a, b) => a - b
    );
    for (let index = 0; index < edges.length - 1; index++) {
      const start = edges[index]!,
        end = edges[index + 1]!;
      const bounds = geometry.clearanceBounds({
        start,
        end,
        segmentId: 'source',
        targetScale: 2,
        pan: { minX: 50, maxX: 50, minY: 50, maxY: 50 },
        actual: { from: point, to: point },
      })!;
      expect(bounds).not.toBeNull();
      for (let sample = 0; sample <= 12; sample++) {
        const time = start + ((end - start) * sample) / 12;
        if (!trailing && time >= 3) continue;
        const camera = resolveVideoCompositionCamera({
          project,
          currentTime: time,
          actions: [],
          cursorSample: null,
        });
        const physical = motionWindowFocusToComposition(
          project,
          selected,
          { x: point.x * project.width, y: point.y * project.height },
          time
        );
        const pixel = mapCompositionPointThroughCamera(physical, camera)!;
        const clearance = Math.min(
          pixel.x,
          pixel.y,
          project.width - pixel.x,
          project.height - pixel.y
        );
        expect(clearance).toBeGreaterThanOrEqual(bounds.viewport!.low - 1e-6);
        expect(clearance).toBeLessThanOrEqual(bounds.viewport!.high + 1e-6);
      }
    }
    expect(project).toEqual(before);
  }
);

it.each(
  (['none', 'linear', 'ease-in-out', 'ease-out', 'instant'] as const).flatMap((type) =>
    [false, true].map((exiting) => [type, exiting] as const)
  )
)('matches source-window %s phase and exact boundaries with exiting=%s', (type, exiting) => {
  const { project, region, policy } = fixture();
  const selected: VideoProjectMotionRegion = {
    ...region,
    focusPoint: { x: 50, y: 50 },
    zoomInDuration: 1,
    zoomOutDuration: 1,
    phaseTransitions: { enter: exiting ? 'none' : type, exit: exiting ? type : 'none' },
    sourceBinding: {
      clipId: project.clips[0]!.id,
      coordinateSpace: 'source-window',
      sourceStart: 0,
      sourceEnd: 3,
      animation: { start: 0, end: 3, duration: 3 },
    },
  };
  project.motionRegions = [selected];
  const before = structuredClone(project);
  const geometry = createProjectWorkingZoneCameraGeometry({
    project,
    region: selected,
    policy,
    connectedIn: false,
    connectedOut: false,
    bindings: new Map(),
  });
  const point = { x: 0.58, y: 0.5 };
  const edge = exiting ? 2 : 0;
  for (const offset of [-0.000001, 0, 0.000001, 0.1, 0.5, 0.999999, 1]) {
    const time = edge + offset;
    if (time < 0 || time >= 3) continue;
    const camera = resolveVideoCompositionCamera({
      project,
      currentTime: time,
      actions: [],
      cursorSample: null,
    });
    const pixel = mapCompositionPointThroughCamera({ x: point.x * 100, y: point.y * 100 }, camera)!;
    const clearance = Math.min(pixel.x, pixel.y, 100 - pixel.x, 100 - pixel.y);
    const bounds = geometry.clearanceBounds({
      start: time,
      end: time,
      segmentId: 'source',
      targetScale: 2,
      pan: { minX: 50, maxX: 50, minY: 50, maxY: 50 },
      actual: { from: point, to: point },
    })!;
    expect(bounds.viewport!.low).toBeCloseTo(clearance, 7);
    expect(bounds.viewport!.high).toBeCloseTo(clearance, 7);
  }
  if (type === 'instant') {
    expect(geometry.breaks).toContain(edge);
    expect(geometry.discontinuities?.(2)).toContain(edge);
    const interval = geometry.clearanceBounds({
      start: edge,
      end: edge + 0.000001,
      segmentId: 'source',
      targetScale: 2,
      pan: { minX: 50, maxX: 50, minY: 50, maxY: 50 },
      actual: { from: point, to: point },
    })!;
    for (const time of [edge, edge + 0.000001]) {
      const camera = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const pixel = mapCompositionPointThroughCamera({ x: 58, y: 50 }, camera)!;
      const clearance = Math.min(pixel.x, pixel.y, 100 - pixel.x, 100 - pixel.y);
      expect(interval.viewport!.low).toBeLessThanOrEqual(clearance + 1e-7);
      expect(interval.viewport!.high).toBeGreaterThanOrEqual(clearance - 1e-7);
    }
  }
  expect(project).toEqual(before);
});

it('matches source-window ease-out connection bounds to the rendered connection', () => {
  const { project, region, policy } = fixture();
  const source: VideoProjectMotionRegion = {
    ...region,
    id: 'from',
    duration: 0.5,
    scale: 1,
    focusPoint: { x: 50, y: 50 },
    phaseTransitions: { enter: 'none', exit: 'none' },
    sourceBinding: {
      clipId: project.clips[0]!.id,
      coordinateSpace: 'source-window',
      sourceStart: 0,
      sourceEnd: 0.5,
      animation: { start: 0, end: 0.5, duration: 0.5 },
    },
  };
  const destination: VideoProjectMotionRegion = {
    ...region,
    id: 'to',
    startTime: 2,
    duration: 1,
    focusPoint: { x: 40, y: 40 },
    phaseTransitions: { enter: 'none', exit: 'none' },
    incomingConnection: { fromRegionId: source.id, easing: VideoTemporalEasing.EASE_OUT },
    sourceBinding: {
      clipId: project.clips[0]!.id,
      coordinateSpace: 'source-window',
      sourceStart: 2,
      sourceEnd: 3,
      animation: { start: 0, end: 1, duration: 1 },
    },
  };
  project.motionRegions = [source, destination];
  const { geometry } = createWindowCameraLinkGeometry({
    output: { width: 100, height: 100 },
    window: { x: 0, y: 0, width: 100, height: 100 },
    video: { x: 0, y: 0, width: 100, height: 100 },
    cornerRadius: 0,
    windowWeight: 'window',
    type: 'ease-out',
    from: { end: 0.5, scale: 1, pan: { x: 0, y: 0 } },
    to: { start: 2, scale: 2, pan: { x: 30, y: 30 } },
    policy,
  });
  const point = { x: 0.1, y: 0.5 };
  for (const time of [0.5, 0.75, 1.25, 1.75, 2]) {
    const camera = resolveVideoCompositionCamera({
      project,
      currentTime: time,
      actions: [],
      cursorSample: null,
    });
    const pixel = mapCompositionPointThroughCamera({ x: 10, y: 50 }, camera)!;
    const bounds = geometry.clearanceBounds({
      start: time,
      end: time,
      segmentId: 'source',
      targetScale: 2,
      pan: { minX: 30, maxX: 30, minY: 30, maxY: 30 },
      actual: { from: point, to: point },
    })!;
    const clearance = Math.min(pixel.x, pixel.y, 100 - pixel.x, 100 - pixel.y);
    expect(bounds.viewport!.low).toBeCloseTo(clearance, 7);
    expect(bounds.viewport!.high).toBeCloseTo(clearance, 7);
  }
});

it.each([false, true])(
  'keeps camera admission on the rendered phase throughout a held tail (source-window=%s)',
  (sourceWindow) => {
    const { project, region, policy } = fixture();
    const selected: VideoProjectMotionRegion = {
      ...region,
      focusPoint: { x: 50, y: 50 },
      zoomInDuration: 0,
      zoomOutDuration: 1,
      phaseTransitions: { enter: 'none', exit: 'linear' },
      animation: { start: 0, end: 3, duration: 3 },
      duration: 3.2,
      sourceBinding: {
        clipId: project.clips[0]!.id,
        ...(sourceWindow ? { coordinateSpace: 'source-window' as const } : {}),
        sourceStart: 0,
        sourceEnd: 3,
        animation: { start: 0, end: 3, duration: 3 },
      },
    };
    project.version = 43;
    project.clips = project.clips.map((clip) => ({
      ...clip,
      duration: 3.2,
      playbackWindow: { offset: 0, extent: 3.2, holdAt: 2.5 },
    }));
    project.motionRegions = [selected];
    const geometry = createProjectWorkingZoneCameraGeometry({
      project,
      region: selected,
      policy,
      connectedIn: false,
      connectedOut: false,
      bindings: new Map([['source', {}]]),
    });
    for (const time of [2.25, 2.5, 2.8, 3.1]) {
      const camera = resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      });
      const pixel = mapCompositionPointThroughCamera({ x: 58, y: 50 }, camera)!;
      const clearance = Math.min(pixel.x, pixel.y, 100 - pixel.x, 100 - pixel.y);
      const bounds = geometry.clearanceBounds({
        start: time,
        end: time,
        segmentId: 'source',
        targetScale: 2,
        pan: { minX: 50, maxX: 50, minY: 50, maxY: 50 },
        actual: { from: { x: 0.58, y: 0.5 }, to: { x: 0.58, y: 0.5 } },
      })!;
      expect(bounds.viewport!.low).toBeCloseTo(clearance, 7);
      expect(bounds.viewport!.high).toBeCloseTo(clearance, 7);
    }
  }
);
