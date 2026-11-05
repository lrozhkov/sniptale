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
  CURSOR_COMPOSITION_PERSPECTIVE_STRENGTH,
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
    project.cursorTrack!.samples = project.cursorTrack!.samples.map((sample) => ({
      ...sample,
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'orbit-spaces',
        sourceClipId: clip.id,
        sourceTime: sample.time,
      },
    }));
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
  const velocity = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (phase) =>
        evaluateCameraTrajectoryDerivative(
          middle,
          middle.start + phase * (middle.end - middle.start),
          1
        ).y
    )
    .map(Math.abs);
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
    perspective: {
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      strength: CURSOR_COMPOSITION_PERSPECTIVE_STRENGTH,
    },
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
    perspective: {
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      strength: CURSOR_COMPOSITION_PERSPECTIVE_STRENGTH,
    },
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

it('retains visible position-driven rocking and fixed direction poses after the cursor rests', () => {
  const observations = [
    { time: 0, x: 1, y: 0.5 },
    { time: 3, x: 1, y: 0.5 },
  ];
  const plan = createCursorOrientationPlan({ settings, observations, start: 0, end: 3 });
  expect(evaluateCursorOrientation(plan, 2)).toEqual({ x: -4, y: -22 });
  for (const [mode, expected] of [
    ['left', { x: -12, y: -18 }],
    ['right', { x: -12, y: 18 }],
  ] as const) {
    const fixed = createCursorOrientationPlan({
      settings: { ...settings, mode },
      observations,
      start: 0,
      end: 3,
    });
    expect(evaluateCursorOrientation(fixed, 0.1)).toEqual(expected);
    expect(evaluateCursorOrientation(fixed, 2.9)).toEqual(expected);
  }
});

it.each([0, 0.6])(
  'does not add future motion to a nearly stationary capture boundary (%s)',
  (smoothness) => {
    const boundary = 16.860109;
    const plan = createCursorOrientationPlan({
      settings: { mode: 'orbit', amount: 0.5, smoothness },
      start: 7.242071458152165,
      end: 21.596838724351592,
      observations: [
        { time: 15.594109, x: 665 / 2560, y: 608 / 1440, segmentId: 'before' },
        { time: boundary, x: 665 / 2560, y: 607 / 1440, segmentId: 'before' },
        { time: boundary, x: 666 / 2560, y: 605 / 1440, segmentId: 'after' },
        { time: 16.922109, x: 685 / 2560, y: 575 / 1440, segmentId: 'after' },
        { time: 16.953109, x: 700 / 2560, y: 550 / 1440, segmentId: 'after' },
        { time: 17.110109, x: 786 / 2560, y: 439 / 1440, segmentId: 'after' },
      ],
    });
    const left = evaluateCursorOrientation(plan, boundary - 0.000001);
    const right = evaluateCursorOrientation(plan, boundary);
    const capturedStep = Math.hypot((24 * 2) / 1440, 44 / 2560);
    const precedingLag = Math.hypot(
      left.x - (-4 + 24 * (607 / 1440 - 0.5)),
      left.y - -44 * (665 / 2560 - 0.5)
    );
    // Retain the preceding run's filtered lag; the new run adds no future displacement.
    expect(Math.hypot(right.x - left.x, right.y - left.y)).toBeLessThanOrEqual(
      capturedStep + precedingLag + 0.000001
    );
    expect(right).toEqual({ x: -4 + 24 * (605 / 1440 - 0.5), y: -44 * (666 / 2560 - 0.5) });
  }
);

it('selects the rendered right-hand polynomial for an exact discontinuous capture cut', () => {
  const plan = createCursorOrientationPlan({
    settings,
    start: 0,
    end: 4,
    observations: [
      { time: 0, x: 0, y: 0.5, segmentId: 'a' },
      { time: 2, x: 0, y: 0.5, segmentId: 'a' },
      { time: 2, x: 1, y: 0.5, segmentId: 'b' },
      { time: 4, x: 1, y: 0.5, segmentId: 'b' },
    ],
  })!;
  const span = cursorOrientationInterval(plan, 2, 2)!;
  expect(span.start).toBe(2);
  expect(evaluateCursorOrientation(plan, 2)).toEqual({ x: -4, y: -22 });
  expect(evaluateCursorOrientation({ spans: [span], breaks: [span.start, span.end] }, 2)).toEqual(
    evaluateCursorOrientation(plan, 2)
  );
  expect(evaluateCursorOrientation(plan, 1.99).y).toBeCloseTo(22, 9);
});

it.each(['left', 'right'] as const)(
  'shares fixed %s roll and strength between rendering and continuous projection',
  async (mode) => {
    const { createWindowCursorProjection, createProjectCursorProjection } =
      await import('./cursor-orientation');
    const region = {
      cursorComposition: { ...settings, mode },
      perspective: {
        ...DEFAULT_CAMERA_PERSPECTIVE,
        enabled: true,
        rotateX: 40,
        rotateY: 35,
        rotateZ: 60,
        strength: 0.2,
      },
    };
    const plan = createCursorOrientationPlan({
      settings: region.cursorComposition,
      observations: [],
      start: 0,
      end: 2,
    })!;
    const rendered = cameraPerspectiveWithCursor(
      region,
      evaluateCursorOrientation(plan, 1)
    ).perspective!;
    const windowProof = createWindowCursorProjection({
      region,
      orientationPlan: plan,
      window: { x: 0, y: 0, width: 1000, height: 600 },
    });
    expect(windowProof.perspective.strength).toBe(rendered.strength);
    expect(windowProof.perspective.rotateZ).toBe(rendered.rotateZ);
    expect(rendered.rotateZ).toBe(mode === 'left' ? -2 : 2);
    const project = createVideoProjectFromRecording({
      recordingId: 'proof',
      filename: 'proof.webm',
      width: 1000,
      height: 600,
      duration: 2,
      mimeType: 'video/webm',
      size: 10,
    });
    const projectRegion = {
      ...createVideoProjectMotionRegion(project, 0),
      ...region,
      focusMode: 'CURSOR' as const,
    };
    const projectProof = createProjectCursorProjection({
      project,
      region: projectRegion,
      orientationPlan: plan,
      window: { width: 1000, height: 600 },
      output: { width: 1000, height: 600 },
      offset: { x: 0, y: 0 },
      phaseAt: () => 1,
    });
    expect(projectProof.perspective?.strength).toBe(rendered.strength);
    expect(projectProof.perspective?.rotateZ).toBe(rendered.rotateZ);
    expect(windowProof.perspective.rotateX).toBe(0);
    expect(windowProof.perspective.rotateY).toBe(0);
  }
);

it('drops nonfinite observations before normalization and uses the missing-track resting pose', () => {
  const compile = (observations: { time: number; x: number; y: number }[]) =>
    createCursorOrientationPlan({ settings, observations, start: 0, end: 1 })!;
  const empty = compile([]);
  for (const observation of [
    { time: 0, x: NaN, y: NaN },
    { time: 0, x: Infinity, y: 0.5 },
    { time: 0, x: 0.5, y: -Infinity },
    { time: NaN, x: 0.5, y: 0.5 },
  ]) {
    const plan = compile([observation]);
    expect(plan.spans.length).toBeGreaterThan(0);
    for (const time of [0, 0.5, 1])
      expect(evaluateCursorOrientation(plan, time)).toEqual(evaluateCursorOrientation(empty, time));
    const valid = { time: 0.5, x: 0.8, y: 0.2 };
    expect(compile([observation, valid])).toEqual(compile([valid]));
  }
});

it('activates cursor pose with independent C2 timing while preserving the authored zoom phase', async () => {
  const { createCursorActivationPlan, cursorActivationAt, evaluateCursorActivation } =
    await import('./cursor-orientation');
  const { interpolateCameraSpatial } = await import('../../project/motion/spatial');
  const activation = createCursorActivationPlan({
    start: 0,
    end: 3,
    enterDuration: 0.15,
    exitDuration: 0.15,
  });
  expect(activation.enter?.end).toBe(0.3);
  expect(activation.exit?.start).toBe(2.7);
  for (const span of [activation.enter!, activation.exit!])
    for (const time of [span.start, span.end])
      for (const order of [1, 2] as const)
        expect(evaluateCameraTrajectoryDerivative(span, time, order).x).toBeCloseTo(0, 9);
  const pose = cameraPerspectiveWithCursor({ cursorComposition: settings }, { x: -4, y: 12 });
  const progress = evaluateCursorActivation(activation, 0.15);
  expect(progress).toBeCloseTo(0.5, 9);
  const frame = interpolateCameraSpatial(null, pose, 1, { from: false, to: true, progress });
  expect(frame).toEqual(interpolateCameraSpatial(null, pose, 0.5, { from: false, to: true }));
  expect(cursorActivationAt(activation, 1)).toBe(1);
  expect(evaluateCursorActivation(activation, 3)).toBeCloseTo(0, 9);
  expect(
    evaluateCursorActivation(
      createCursorActivationPlan({
        start: 0,
        end: 3,
        enterDuration: 0.15,
        exitDuration: 0.15,
        connectedIn: true,
        connectedOut: true,
      }),
      0
    )
  ).toBe(1);
});

it('retains the logical Native animation clock across a source-window slice', async () => {
  const { projectCursorActivationPlan, evaluateCursorActivation } =
    await import('./cursor-orientation');
  const project = createVideoProjectFromRecording({
    recordingId: 'activation-slice',
    filename: 'slice.webm',
    width: 1000,
    height: 600,
    duration: 10,
    mimeType: 'video/webm',
    size: 1,
  });
  const region = {
    ...createVideoProjectMotionRegion(project, 5),
    startTime: 5,
    duration: 5,
    animation: { start: 5, end: 10, duration: 10 },
    zoomInDuration: 0.15,
    zoomOutDuration: 0.15,
  };
  const plan = projectCursorActivationPlan(project, region);
  expect(plan.enter?.start).toBe(0);
  expect(plan.exit?.end).toBe(10);
  expect(evaluateCursorActivation(plan, 5)).toBe(1);
  expect(plan.exit!.end - plan.exit!.start).toBeCloseTo(0.65, 9);
  expect(evaluateCursorActivation(plan, (plan.exit!.start + plan.exit!.end) / 2)).toBeCloseTo(
    0.5,
    9
  );
});

it('uses the resolved movement policy for the same Native and Gallery cursor activation curve', async () => {
  const { createCameraFollowSettings, resolveCameraFollowPolicy } =
    await import('../../project/camera/cursor-policy');
  const { projectCursorSpatial, projectCursorActivationPlan } =
    await import('./cursor-orientation');
  const { applyReviewCameraSpatial } = await import('../../review/advanced/spatial');
  const { createQuickEditZoomRegion } = await import('../../review/advanced/zoom');
  const project = createVideoProjectFromRecording({
    recordingId: 'policy-parity',
    filename: 'policy.webm',
    width: 1000,
    height: 600,
    duration: 30,
    mimeType: 'video/webm',
    size: 1,
  });
  project.cameraFollowDefaults = { ...createCameraFollowSettings(), transitionDuration: 5 };
  const base = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 30,
    zoomInDuration: 0.15,
    zoomOutDuration: 0.15,
    focusMode: 'CURSOR' as const,
    cursorComposition: settings,
  };
  for (const override of [
    undefined,
    { ...createCameraFollowSettings(), transitionDuration: 0.65 },
  ]) {
    const region = { ...base, ...(override ? { cameraFollow: override } : {}) };
    const policy = resolveCameraFollowPolicy({
      defaults: project.cameraFollowDefaults,
      ...(override ? { override } : {}),
    });
    const activation = projectCursorActivationPlan(project, region);
    expect(activation.enter!.end).toBe(policy.settings.transitionDuration);
    const gallery = {
      ...createQuickEditZoomRegion({ id: 'policy-parity', at: 0, duration: 30 }),
      cursorComposition: settings,
      enter: { type: 'ease-in-out' as const, duration: 0.15 },
      exit: { type: 'ease-in-out' as const, duration: 0.15 },
      cursorFocus: {
        policy,
        path: {
          version: 1 as const,
          mode: 'follow' as const,
          smoothing: 0,
          sensitivity: 0.5,
          gapPolicy: 'hold' as const,
          segments: [],
        },
      },
    };
    for (const time of [0.15, 0.3, 1, 29.7]) {
      const native = projectCursorSpatial(project, region, time, 1)!;
      const review = applyReviewCameraSpatial(
        [gallery],
        time,
        { from: null, to: gallery, progress: 1, phase: 'enter' },
        gallery.transform
      ).spatial!;
      expect(review.rotation).toEqual(native.rotation);
      expect(review.perspective).toBe(native.perspective);
      expect(review.windowMotion).toBe(native.windowMotion);
    }
  }
});
