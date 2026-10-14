import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import {
  VideoCursorCaptureMode,
  VideoMediaFitMode,
  VideoMotionFocusMode,
  VideoTemporalEasing,
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
  const region = {
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

it('retains source crop failure before rotation even when the resulting canvas point is inside the output', () => {
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
    region: { ...region, zoomInDuration: 0, zoomOutDuration: 0 },
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
});

it('bounds the real editable cursor curve instead of a linear approximation between preview samples', () => {
  const { project, region, policy } = fixture();
  project.cursorTrack!.samples[0]!.interpolation = VideoTemporalEasing.EASE_OUT;
  const bounds = boundRenderedCursorPosition(project, 0.25, 0.5)!;
  for (const time of [0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) {
    const actual = resolveVideoCompositionCursor(project, time, [])!;
    expect(actual.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(actual.x).toBeLessThanOrEqual(bounds.maxX);
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

it('bounds full nominal screen motion for a held zone and scales the bounds with the actual output', () => {
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
  expect(original.speed).toBeGreaterThan(0);
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
