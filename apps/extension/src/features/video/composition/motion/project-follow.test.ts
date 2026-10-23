import {
  bindMotionRegionToClip,
  reconcileMotionSourceBindings,
} from '../../project/motion/source-binding';
import { materializeVideoProjectCursorSourceObservations } from '../../project/cursor-source-observations';
import { sliceClipPlaybackWindow } from '../../project/timeline/rate';
import { mapCompositionPointThroughCamera, resolveVideoCompositionCamera } from './index';
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

it.each([false, true])(
  'coordinates adjacent retained portions of the same nominal animation clock with remembered link=%s',
  (remembered) => {
    const { project, region } = fixture();
    project.version = remembered ? 34 : 4;
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
    if (remembered) left.phaseTransitions = { link: VideoTemporalEasing.LINEAR };
    project.motionRegions = [left, right];
    expect(isValidVideoProject(project)).toBe(true);
    const before = structuredClone(project);
    const end = resolveProjectFollowingCamera(project, left, 1.5);
    const start = resolveProjectFollowingCamera(project, right, 1.5);
    expect(end.plan.status).toBe('ready');
    expect(start.plan.status).toBe('ready');
    expect(start.pan.x).toBeCloseTo(end.pan.x, 8);
    expect(project).toEqual(before);
  }
);

it('projects a cropped source cursor once during camera containment and preserves native observations', async () => {
  const { resolveVideoCompositionCursor } = await import('../timeline/frame/cursor');
  const { project, region } = fixture();
  project.cursorTrack!.captureMode = VideoCursorCaptureMode.SEPARATE;
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source');
  clip.transform = { x: 100, y: 100, width: 400, height: 300, rotation: 0, opacity: 1 };
  clip.sourceCrop = { x: 0.5, y: 0, width: 0.5, height: 1 };
  clip.fitMode = 'STRETCH';
  const before = structuredClone(project);
  const cursor = resolveVideoCompositionCursor(project, 1, [])!;
  expect(cursor.x).toBeCloseTo(156, 9);
  expect(cursor.y).toBeCloseTo(250, 9);
  const camera = resolveProjectFollowingCamera(project, region, 1);
  expect(camera.plan.status).toBe('ready');
  const x = cursor.x * camera.targetScale - camera.pan.x,
    y = cursor.y * camera.targetScale - camera.pan.y;
  expect(x).toBeGreaterThanOrEqual(-0.5);
  expect(x).toBeLessThanOrEqual(project.width + 0.5);
  expect(y).toBeGreaterThanOrEqual(-0.5);
  expect(y).toBeLessThanOrEqual(project.height + 0.5);
  expect(project).toEqual(before);
});

it('does not admit stale cursor containment after an instant camera position', async () => {
  const { resolveVideoCompositionCursor } = await import('../timeline/frame/cursor');
  const { project, region } = fixture();
  project.cursorTrack!.captureMode = VideoCursorCaptureMode.SEPARATE;
  project.cursorTrack!.samples = project.cursorTrack!.samples.map((sample) => ({
    ...sample,
    x: 500,
    recordingPoint: { x: 0.5, y: 0.5 },
  }));
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Missing source');
  project.tracks = project.tracks.map((track) =>
    track.id === clip.trackId ? { ...track, role: 'CAMERA' } : track
  );
  clip.transform = { x: 100, y: 200, width: 200, height: 200, rotation: 0, opacity: 1 };
  clip.fitMode = 'STRETCH';
  clip.cameraPositions = [
    {
      id: 'right',
      sourceTime: 1,
      transform: { ...clip.transform, x: 700 },
      fitMode: 'STRETCH',
      transition: { kind: 'instant', duration: 0 },
    },
  ];
  const cameraRegion = { ...region, scale: 2 };
  project.motionRegions = [cameraRegion];
  expect(isValidVideoProject(project)).toBe(true);
  const cursor = resolveVideoCompositionCursor(project, 1.5, [])!;
  expect(cursor.x).toBeCloseTo(800, 9);
  const camera = resolveProjectFollowingCamera(project, cameraRegion, 1.5);
  if (camera.plan.status === 'ready') {
    const x = cursor.x * camera.targetScale - camera.pan.x;
    expect(x).toBeGreaterThanOrEqual(-0.5);
    expect(x).toBeLessThanOrEqual(project.width + 0.5);
  } else expect(camera.plan.status).toBe('conflict');
});

it.each(['instant', 'smooth', 'shrink'] as const)(
  'admits a feasible %s camera move after an initially hidden interval',
  (kind) => {
    const { project, region } = fixture();
    project.cursorTrack!.captureMode = VideoCursorCaptureMode.SEPARATE;
    project.cursorTrack!.samples = project.cursorTrack!.samples.map((sample) => ({
      ...sample,
      x: 500,
      recordingPoint: { x: 0.5, y: 0.5 },
    }));
    const clip = project.clips[0]!;
    if (clip.type !== 'VIDEO') throw new Error('Missing source');
    project.tracks = project.tracks.map((track) =>
      track.id === clip.trackId ? { ...track, role: 'CAMERA' } : track
    );
    clip.transform = { x: 100, y: 200, width: 80, height: 80, rotation: 0, opacity: 1 };
    clip.fitMode = 'STRETCH';
    clip.cameraHiddenRanges = [{ id: 'opening', start: 0, end: 0.5 }];
    clip.cameraPositions = [
      {
        id: 'small',
        sourceTime: 1,
        transform: { ...clip.transform, x: 120 },
        fitMode: 'STRETCH',
        transition: { kind, duration: 0.5 },
      },
    ];
    const cameraRegion = { ...region, scale: 2 };
    project.motionRegions = [cameraRegion];
    const camera = resolveProjectFollowingCamera(project, cameraRegion, 2);
    expect(camera.plan.status).toBe('ready');
  }
);

it.each([
  [0, 0.99, 'ready'],
  [45, 0.99, 'conflict'],
  [90, 0.99, 'ready'],
  [-135, 0.99, 'conflict'],
  [45, 0.5, 'ready'],
] as const)(
  'admits the physical rotated window cursor: rotation=%s position=%s',
  (rotation, position, status) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'rotated-admission',
      filename: 'window.webm',
      width: 400,
      height: 400,
      duration: 3,
      mimeType: 'video/webm',
      size: 10,
      cursorTrack: {
        captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
        skin: normalizeVideoProjectCursorSkin(undefined),
        samples: [0, 3].map((time) => ({
          id: `cursor:${time}`,
          time,
          x: position * 400,
          y: position * 400,
          visible: true,
          observation: 'observed' as const,
          recordingPoint: { x: position, y: position },
          captureSegment: 0,
        })),
      },
    });
    const clip = project.clips.find((item) => item.type === 'VIDEO')!;
    if (clip.type !== 'VIDEO') throw new Error('Missing video');
    clip.transform.rotation = rotation;
    const region = {
      ...createVideoProjectMotionRegion(project, 0, { enter: 'none', exit: 'none' }),
      duration: 3,
      scale: 2,
      focusMode: VideoMotionFocusMode.CURSOR,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      sourceBinding: {
        clipId: clip.id,
        coordinateSpace: 'source-window' as const,
        sourceStart: 0,
        sourceEnd: 3,
        animation: { start: 0, end: 3, duration: 3 },
      },
    };
    project.motionRegions = [region];
    const before = structuredClone(project);
    const plan = resolveProjectCursorCameraPlan(project, region);
    expect(plan.status).toBe(status);
    if (status === 'conflict') expect(plan).toMatchObject({ reason: 'viewport' });
    for (const output of [undefined, { width: 320, height: 180 }]) {
      expect(resolveProjectCursorCameraPlan(project, region, output).status).toBe(status);
    }
    if (status === 'ready') {
      const angle = (rotation * Math.PI) / 180;
      const dx = position * project.width - project.width / 2;
      const dy = position * project.height - project.height / 2;
      const physical = {
        x: 200 + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: 200 + dx * Math.sin(angle) + dy * Math.cos(angle),
      };
      const camera = resolveVideoCompositionCamera({
        project,
        currentTime: 1.5,
        actions: [],
        cursorSample: null,
      });
      const pixel = mapCompositionPointThroughCamera(physical, camera)!;
      expect(pixel.x).toBeGreaterThanOrEqual(-1e-6);
      expect(pixel.y).toBeGreaterThanOrEqual(-1e-6);
      expect(pixel.x).toBeLessThanOrEqual(project.width + 1e-6);
      expect(pixel.y).toBeLessThanOrEqual(project.height + 1e-6);
    }
    expect(project).toEqual(before);
  }
);

it.each([0, 3.05, 0.05])(
  'retains the complete source-follow context for a window at %s',
  (placement) => {
    const { project, region: raw } = fixture();
    const clip = project.clips.find((item) => item.type === 'VIDEO')!;
    clip.sourceInstanceId = 'retained-follow';
    project.version = 33;
    project.cursorTrack = {
      captureMode: 'separate',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [],
      sourceObservations: [
        {
          recordingId: 'zones',
          sourceInstanceId: 'retained-follow',
          samples: [0, 0.5, 1, 1.5, 2, 2.5, 3].map((time) => ({
            id: `p:${time}`,
            time,
            x: 150 + (700 * time) / 3,
            y: 300,
            visible: true,
            captureSegment: 0,
            recordingPoint: { x: (150 + (700 * time) / 3) / 1000, y: 0.5 },
          })),
        },
      ],
    };
    project.cursorTrack = materializeVideoProjectCursorSourceObservations(project);
    const bound = bindMotionRegionToClip({ ...raw, scale: 2 }, clip);
    bound.sourceBinding = { ...bound.sourceBinding!, coordinateSpace: 'source-window' };
    project.motionRegions = [bound];
    const expected = resolveVideoCompositionCamera({
      project,
      currentTime: 2.5,
      actions: [],
      cursorSample: null,
    });
    expect(resolveProjectCursorCameraPlan(project, bound).status).toBe('ready');
    const windowed = {
      ...clip,
      duration: 3.2,
      playbackWindow: { offset: 0, extent: 3.2, holdAt: 2.5 },
    };
    const held = { ...project, version: 43 as const, duration: 3.2, clips: [windowed] };
    let candidate: typeof project = held;
    let time = 3.1;
    if (placement > 0) {
      const trailing = {
        ...windowed,
        id: 'retained-tail',
        startTime: placement,
        duration: 0.15,
        playbackWindow: sliceClipPlaybackWindow(windowed, 3.05),
      };
      candidate = reconcileMotionSourceBindings(
        held,
        { ...held, clips: [{ ...windowed, duration: 3.05 }, trailing] },
        new Map([[clip.id, trailing.id]])
      );
      if (placement < 1)
        candidate = {
          ...candidate,
          clips: [trailing],
          motionRegions: candidate.motionRegions!.filter(
            (item) => item.sourceBinding?.clipId === trailing.id
          ),
        };
      time = placement + 0.05;
    }
    candidate.cursorTrack = materializeVideoProjectCursorSourceObservations(candidate);
    expect(isValidVideoProject(candidate)).toBe(true);
    const before = structuredClone(candidate);
    const actual = resolveVideoCompositionCamera({
      project: candidate,
      currentTime: time,
      actions: [],
      cursorSample: null,
    });
    expect(actual.scale).toBeCloseTo(expected.scale, 6);
    expect(actual.viewportX).toBeCloseTo(expected.viewportX, 6);
    expect(actual.viewportY).toBeCloseTo(expected.viewportY, 6);
    expect(candidate).toEqual(before);
  }
);
