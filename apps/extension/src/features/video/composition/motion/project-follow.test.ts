import { isValidVideoProject } from '../../project/validation/root';
import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { normalizeVideoProjectCursorSkin } from '../../project/cursor';
import { createCameraFollowSettings } from '../../project/camera/cursor-policy';
import {
  VideoMotionFocusMode,
  VideoCursorCaptureMode,
  VideoTemporalEasing,
} from '../../project/types';
import { resolveProjectCursorCameraPlan, resolveProjectFollowingCamera } from './project-follow';

function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'zones',
    filename: 'zones.webm',
    width: 1000,
    height: 600,
    duration: 3,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        {
          id: 'start',
          time: 0,
          x: 570,
          y: 300,
          visible: true,
          recordingPoint: { x: 0.57, y: 0.5 },
          captureSegment: 0,
        },
        {
          id: 'end',
          time: 3,
          x: 570,
          y: 300,
          visible: true,
          recordingPoint: { x: 0.57, y: 0.5 },
          captureSegment: 0,
        },
      ],
    },
  });
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 3,
    focusMode: VideoMotionFocusMode.CURSOR,
    scale: 1.2,
    zoomInDuration: 0,
    zoomOutDuration: 0,
  };
  project.motionRegions = [region];
  return { project, region };
}

it('holds one activity-centered pose and reuses admission across random-access evaluations', () => {
  const { project, region } = fixture();
  const before = structuredClone(project);
  const plan = resolveProjectCursorCameraPlan(project, region);
  expect(plan.status).toBe('ready');
  const middle = resolveProjectFollowingCamera(project, region, 1.5);
  resolveProjectFollowingCamera(project, region, 2.9);
  resolveProjectFollowingCamera(project, region, 0);
  expect(resolveProjectCursorCameraPlan(project, region)).toBe(plan);
  expect(resolveProjectFollowingCamera(project, region, 1.5).focusPoint).toEqual(middle.focusPoint);
  expect(middle.focusPoint.x).toBeCloseTo(570, 6);
  expect(project).toEqual(before);
});

it('invalidates admission when geometry or authoring changes in a new project revision', () => {
  const { project, region } = fixture();
  const first = resolveProjectCursorCameraPlan(project, region);
  const changed = { ...project, width: 1200 };
  expect(resolveProjectCursorCameraPlan(changed, region)).not.toBe(first);
  const viewport = resolveProjectCursorCameraPlan(project, region, { width: 500, height: 300 });
  expect(viewport).not.toBe(first);
  expect(resolveProjectCursorCameraPlan(project, region, { width: 500, height: 300 })).toBe(
    viewport
  );
});

it('keeps empty coverage at the authored base pose without manufacturing captured points', () => {
  const { project, region } = fixture();
  const empty = { ...project, cursorTrack: { ...project.cursorTrack!, samples: [] } };
  const camera = resolveProjectFollowingCamera(empty, region, 1);
  expect(camera.focusPoint).toEqual(region.focusPoint);
});

it('admits a fast authored zoom toward a held zone without changing authoring', () => {
  const { project, region } = fixture();
  const fast = { ...region, scale: 4, zoomInDuration: 0.01 };
  const changed = { ...project, motionRegions: [fast] };
  const before = structuredClone(changed);
  expect(resolveProjectCursorCameraPlan(changed, fast)).toMatchObject({
    status: 'ready',
    targetScale: 4,
  });
  expect(changed).toEqual(before);
});

it.each([VideoMotionFocusMode.MANUAL, VideoMotionFocusMode.CURSOR])(
  'shares a compatible contiguous %s endpoint without changing native facts',
  (mode) => {
    const { project, region } = fixture();
    const from = {
      ...region,
      id: 'from',
      duration: 1.5,
      scale: 2,
      focusMode: mode,
      focusPoint: { x: 400, y: 300 },
    };
    const to = { ...region, id: 'to', startTime: 1.5, duration: 1.5, scale: 2 };
    project.motionRegions = [from, to];
    if (mode === VideoMotionFocusMode.CURSOR)
      project.cursorTrack!.samples[0] = {
        ...project.cursorTrack!.samples[0]!,
        x: 400,
        recordingPoint: { x: 0.4, y: 0.5 },
      };
    const before = structuredClone(project);
    const end =
      mode === VideoMotionFocusMode.CURSOR
        ? resolveProjectFollowingCamera(project, from, 1.5).pan
        : { x: 300, y: 300 };
    const start = resolveProjectFollowingCamera(project, to, 1.5);
    expect(start.plan.status).toBe('ready');
    expect(start.pan.x).toBeCloseTo(end.x, 8);
    expect(start.pan.y).toBeCloseTo(end.y, 8);
    expect(project).toEqual(before);
  }
);

it('contains the confirmed embedded pointer on the complete closing interval of a source clip', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'tail',
    filename: 'tail.webm',
    width: 1000,
    height: 600,
    duration: 0.124,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        [0, 500],
        [0.1, 500],
        [0.124, 1000],
      ].map(([time, x], index) => ({
        id: `tail-${index}`,
        time: time!,
        x: x!,
        y: 300,
        visible: true,
        recordingPoint: { x: x! / 1000, y: 0.5 },
        captureSegment: 0,
      })),
    },
  });
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 0.124,
    focusMode: VideoMotionFocusMode.CURSOR,
    scale: 2,
    zoomInDuration: 0,
    zoomOutDuration: 0,
  };
  project.motionRegions = [region];
  const before = structuredClone(project);
  const result = resolveProjectFollowingCamera(project, region, 0.123);
  if (result.plan.status === 'ready') {
    const nativeX = 0.5 + (0.5 * (0.123 - 0.1)) / 0.024;
    const screenX = nativeX * 1000 * result.targetScale - result.pan.x;
    expect(screenX).toBeGreaterThanOrEqual(-0.5);
    expect(screenX).toBeLessThanOrEqual(1000.5);
  } else
    expect(result.plan).toMatchObject({ status: 'conflict', interval: { start: 0, end: 0.124 } });
  expect(project).toEqual(before);
});

it('retains both source-owned sides at a cut without interpolating across source instances', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'cut',
    filename: 'cut.webm',
    width: 1000,
    height: 600,
    duration: 0.248,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        [0, 500],
        [0.1, 500],
        [0.124, 1000],
        [0.2, 500],
        [0.248, 500],
      ].map(([time, x], index) => ({
        id: `cut-${index}`,
        time: time!,
        x: x!,
        y: 300,
        visible: true,
        recordingPoint: { x: x! / 1000, y: 0.5 },
        captureSegment: 0,
      })),
    },
  });
  const first = project.clips[0]!;
  if (first.type !== 'VIDEO') throw new Error('Expected video clip');
  first.duration = 0.124;
  first.sourceDuration = 0.124;
  const second = {
    ...first,
    id: 'cut-right',
    sourceInstanceId: 'cut-right-instance',
    startTime: 0.124,
    sourceStart: 0.124,
  };
  project.clips = [first, second];
  const track = project.cursorTrack!;
  track.samples = track.samples.map((sample) =>
    sample.time > 0.124
      ? {
          ...sample,
          captureSegment: 1,
          sourceAnchor: { ...sample.sourceAnchor!, sourceClipId: second.id },
        }
      : sample
  );
  const closing = track.samples[2]!;
  track.samples.splice(3, 0, {
    ...closing,
    id: 'cut-open',
    x: 0,
    recordingPoint: { x: 0, y: 0.5 },
    captureSegment: 1,
    sourceAnchor: { ...closing.sourceAnchor!, sourceClipId: second.id },
  });
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 0.248,
    focusMode: VideoMotionFocusMode.CURSOR,
    scale: 2,
    zoomInDuration: 0,
    zoomOutDuration: 0,
  };
  project.motionRegions = [region];
  expect(isValidVideoProject(project)).toBe(true);
  const before = structuredClone(project);
  const left = resolveProjectFollowingCamera(project, region, 0.123);
  const right = resolveProjectFollowingCamera(project, region, 0.124);
  expect(left.plan.status).toBe('ready');
  expect(1000 * (0.5 + (0.5 * 0.023) / 0.024) * left.targetScale - left.pan.x).toBeLessThanOrEqual(
    1000.5
  );
  expect(right.pan.x).toBeCloseTo(0, 8);
  if (right.plan.status === 'ready')
    expect(right.plan.discontinuities).toContainEqual({ time: 0.124, reason: 'source' });
  expect(project).toEqual(before);
});

it('coordinates adjacent retained portions of the same nominal animation clock', () => {
  const { project, region } = fixture();
  project.version = 4;
  project.cameraFollowDefaults = createCameraFollowSettings('fast');
  project.cursorTrack!.samples[0] = {
    ...project.cursorTrack!.samples[0]!,
    x: 400,
    recordingPoint: { x: 0.4, y: 0.5 },
  };
  const left = {
    ...region,
    id: 'clock-left',
    scale: 2,
    duration: 1.5,
    zoomInDuration: 0.6,
    zoomOutDuration: 0.6,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    animation: { start: 0, end: 1.5, duration: 3 },
  };
  const right = {
    ...left,
    id: 'clock-right',
    startTime: 1.5,
    animation: { start: 1.5, end: 3, duration: 3 },
  };
  project.motionRegions = [left, right];
  expect(isValidVideoProject(project)).toBe(true);
  const before = structuredClone(project);
  const end = resolveProjectFollowingCamera(project, left, 1.5);
  const start = resolveProjectFollowingCamera(project, right, 1.5);
  expect(end.plan.status).toBe('ready');
  expect(start.plan.status).toBe('ready');
  expect(start.pan.x).toBeCloseTo(end.pan.x, 8);
  expect(project).toEqual(before);
});
