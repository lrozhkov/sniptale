import { expect, it } from 'vitest';
import {
  createCursorOrientationPlan,
  evaluateCursorOrientation,
  cursorOrientationInterval,
  smoothCursorCameraPreferences,
  resolveProjectCursorOrientation,
} from './cursor-orientation';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { bindMotionRegionToClip } from '../../project/motion/source-binding';
import { normalizeVideoProjectCursorSkin } from '../../project/cursor';
import { evaluateCameraTrajectoryDerivative } from './camera-trajectory';
import {
  boundQuickEditCameraMotion,
  boundQuickEditCameraProjection,
  boundCameraPlaneProjection,
} from './spatial-projection-bounds';
import {
  DEFAULT_CURSOR_COMPOSITION,
  parseCursorCompositionSettings,
  cameraPerspectiveWithCursor,
  DEFAULT_CAMERA_PERSPECTIVE,
} from '../../project/motion/spatial';

const settings = { ...DEFAULT_CURSOR_COMPOSITION };
it.each([false, true])(
  'keeps canvas and source-window cursor poses independent in either evaluation order (%s)',
  (reverse) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'orbit-spaces',
      filename: 'orbit.webm',
      width: 1000,
      height: 600,
      duration: 3,
      mimeType: 'video/webm',
      size: 10,
    });
    project.cursorTrack = {
      captureMode: 'separate',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [0, 3].map((time) => ({
        id: `sample:${time}`,
        time,
        x: 800,
        y: 200,
        visible: true,
        recordingPoint: { x: 0.8, y: 1 / 3 },
        captureSegment: 0,
      })),
    };
    const clip = project.clips.find((item) => item.type === 'VIDEO')!;
    clip.transform = { ...clip.transform, x: 200, y: 120, width: 600, height: 360 };
    const canvas = bindMotionRegionToClip(
      {
        ...createVideoProjectMotionRegion(project, 0),
        focusMode: 'CURSOR',
        cursorComposition: settings,
        duration: 3,
      },
      clip
    );
    const window = {
      ...canvas,
      id: `${canvas.id}:window`,
      sourceBinding: { ...canvas.sourceBinding!, coordinateSpace: 'source-window' as const },
    };
    project.motionRegions = [canvas, window];
    const expected = [canvas, window].map((region) =>
      resolveProjectCursorOrientation(structuredClone(project), region)
    );
    expect(evaluateCursorOrientation(expected[0], 1.5)).not.toEqual(
      evaluateCursorOrientation(expected[1], 1.5)
    );
    for (const index of reverse ? [1, 0] : [0, 1]) {
      const actual = resolveProjectCursorOrientation(project, project.motionRegions[index]!);
      expect(actual).toEqual(expected[index]);
    }
  }
);
it('admits only complete finite cursor settings and preserves absent legacy settings', () => {
  expect(parseCursorCompositionSettings(undefined)).toBeUndefined();
  for (const invalid of [
    null,
    {},
    { ...settings, mode: 'random' },
    { ...settings, amount: NaN },
    { ...settings, smoothness: 1.1 },
  ])
    expect(parseCursorCompositionSettings(invalid)).toBeNull();
  expect(parseCursorCompositionSettings(settings)).toEqual(settings);
});

it('evaluates matching C2 boundaries and random seeks without repeated velocity stops', () => {
  const observations = Array.from({ length: 301 }, (_, index) => ({
    time: index / 30,
    x: index / 300,
    y: 0.5,
  }));
  const plan = createCursorOrientationPlan({ settings, observations, start: 0, end: 10 })!;
  for (let index = 1; index < plan.spans.length; index++) {
    const left = plan.spans[index - 1]!,
      right = plan.spans[index]!;
    for (const order of [1, 2] as const) {
      const a = evaluateCameraTrajectoryDerivative(left, left.end, order),
        b = evaluateCameraTrajectoryDerivative(right, right.start, order);
      expect(a.x).toBeCloseTo(b.x, 9);
      expect(a.y).toBeCloseTo(b.y, 9);
    }
  }
  const chronological = new Map(
    [0, 2, 5, 8, 10].map((time) => [time, evaluateCursorOrientation(plan, time)])
  );
  for (const time of [10, 5, 0, 8, 2, 5])
    expect(evaluateCursorOrientation(plan, time)).toEqual(chronological.get(time));
  const middle = plan.spans[Math.floor(plan.spans.length / 2)]!;
  const velocity = [0, 0.25, 0.5, 0.75, 1].map(
    (phase) =>
      evaluateCameraTrajectoryDerivative(
        middle,
        middle.start + phase * (middle.end - middle.start),
        1
      ).y
  );
  expect(Math.min(...velocity)).toBeGreaterThan(0.9 * Math.max(...velocity));
  expect(cursorOrientationInterval(plan, plan.spans[0]!.start, plan.spans[1]!.end)).toBeNull();
});

it('reduces framing jitter without changing pointer constraints, manual pins, or coverage segments', () => {
  const frames = Array.from({ length: 61 }, (_, index) => ({
    time: index / 30,
    x: 0.5 + (index % 2 ? 0.02 : -0.02),
    y: 0.5,
    segmentId: index < 31 ? 'a' : 'b',
    actual: { x: index / 60, y: 0.5 },
    ...(index === 15 ? { preferenceWeight: 4 } : {}),
  }));
  frames[31]!.x = 0.9;
  const smoothed = smoothCursorCameraPreferences(frames, { ...settings, mode: 'off' });
  expect(Math.abs(smoothed[10]!.x - 0.5)).toBeLessThan(0.01);
  expect(smoothed[15]).toBe(frames[15]);
  smoothed.forEach((frame, index) => {
    expect(frame.actual).toBe(frames[index]!.actual);
    expect(frame.segmentId).toBe(frames[index]!.segmentId);
  });
  expect(smoothCursorCameraPreferences(frames, undefined)).toEqual(frames);
});

it('suppresses saved manual spatial effects only for explicit cursor composition and retains the source', () => {
  const authored = {
    perspective: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateY: 35 },
    depthOfField: {
      enabled: true,
      mode: 'depth' as const,
      x: 0.5,
      y: 0.5,
      width: 0.2,
      softness: 0.3,
      strength: 0.5,
    },
  };
  expect(cameraPerspectiveWithCursor(authored, { x: 2, y: 4 })).toBe(authored);
  const off = cameraPerspectiveWithCursor(
    { ...authored, cursorComposition: { ...settings, mode: 'off' } },
    { x: 2, y: 4 }
  );
  expect(off.perspective).toBeUndefined();
  expect(off.depthOfField).toBeUndefined();
  const orbit = cameraPerspectiveWithCursor(
    { ...authored, cursorComposition: settings },
    { x: 2, y: 4 }
  );
  expect(orbit.perspective?.rotateY).toBe(4);
  expect(authored.perspective.rotateY).toBe(35);
});

it('includes orbit-only movement in both decorated-window and general-canvas continuous proof', () => {
  const plan = createCursorOrientationPlan({
    settings,
    observations: [
      { time: 0, x: 0.1, y: 0.5 },
      { time: 1, x: 0.9, y: 0.2 },
    ],
    start: 0,
    end: 1,
  })!;
  const span = plan.spans[0]!;
  const input = {
    start: span.start + 0.1 * (span.end - span.start),
    end: span.start + 0.2 * (span.end - span.start),
    window: { x: 100, y: 70, width: 800, height: 500 },
    video: { x: 100, y: 120, width: 800, height: 450 },
    output: { width: 1000, height: 640 },
    cornerRadius: 20,
    targetScale: 2,
    phase: 1,
    pan: { minX: 400, maxX: 400, minY: 250, maxY: 250 },
    windowWeight: 'window' as const,
    perspective: { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0.5 },
    orbit: { angles: span },
    actual: { from: { x: 0.5, y: 0.5 }, to: { x: 0.5, y: 0.5 } },
  };
  const proof = boundQuickEditCameraProjection(input)!;
  expect(proof.denominator.low).toBeGreaterThan(0);
  expect(proof.viewport?.low).toBeGreaterThan(0);
  const motion = boundQuickEditCameraMotion(input)!;
  expect(motion.speed).toBeGreaterThan(0);
  expect(motion.acceleration).toBeGreaterThan(0);
  expect(motion.jerk).toBeGreaterThan(0);
  const general = boundCameraPlaneProjection({
    ...input,
    motion: true,
    reference: input.window,
    source: { x: [100, 900], y: [70, 570] },
    offset: { x: 0, y: 0 },
  })!;
  expect(general.speed).toBeGreaterThan(0);
  const { orbit: _orbit, ...withoutOrbit } = input;
  const legacy = boundQuickEditCameraMotion(withoutOrbit);
  expect(legacy).toEqual({ speed: 0, acceleration: 0, jerk: 0 });
});

it('continuously bounds the same moving decorated-window projection rendered at intermediate times', async () => {
  const { quickEditPlaneProjection, projectQuickEditPoint } = await import('./spatial-geometry');
  const { interpolateCameraSpatial } = await import('../../project/motion/spatial');
  const plan = createCursorOrientationPlan({
    settings,
    observations: [
      { time: 0, x: 0.1, y: 0.3 },
      { time: 2, x: 0.9, y: 0.7 },
    ],
    start: 0,
    end: 2,
  })!;
  const span = plan.spans[1]!;
  const start = span.start + 0.2 * (span.end - span.start),
    end = span.start + 0.3 * (span.end - span.start);
  const window = { x: 100, y: 70, width: 800, height: 500 },
    video = { x: 100, y: 120, width: 800, height: 450 };
  const proof = boundQuickEditCameraProjection({
    start,
    end,
    window,
    video,
    output: { width: 1000, height: 640 },
    cornerRadius: 20,
    targetScale: 2,
    phase: 1,
    pan: { minX: 400, maxX: 400, minY: 250, maxY: 250 },
    windowWeight: 'window',
    perspective: { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0.5 },
    orbit: { angles: span },
    actual: { from: { x: 0.5, y: 0.5 }, to: { x: 0.5, y: 0.5 } },
  })!;
  for (let index = 0; index <= 40; index++) {
    const time = start + ((end - start) * index) / 40;
    const target = cameraPerspectiveWithCursor(
      { cursorComposition: settings },
      evaluateCursorOrientation(plan, time)
    );
    const frame = interpolateCameraSpatial(null, target, 1, { from: false, to: true });
    const projection = quickEditPlaneProjection(
      window,
      { x: window.x - 400, y: window.y - 250, width: 1600, height: 1000 },
      frame
    );
    const point = projectQuickEditPoint(projection, {
      x: video.x + 0.5 * video.width,
      y: video.y + 0.5 * video.height,
    })!;
    const clearance = Math.min(point.x, point.y, 1000 - point.x, 640 - point.y);
    expect(clearance).toBeGreaterThanOrEqual(proof.viewport!.low - 1e-8);
    expect(clearance).toBeLessThanOrEqual(proof.viewport!.high + 1e-8);
  }
});
