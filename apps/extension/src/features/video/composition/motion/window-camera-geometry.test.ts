import { expect, it } from 'vitest';
import {
  createWindowCameraGeometry,
  createWindowCameraLinkGeometry,
  planWindowCameraGap,
  evaluateWindowCameraLinkFit,
} from './window-camera-geometry';
import { proveCameraPlan, type CameraPlanSpan } from './camera-plan-proof';
import {
  resolveCameraFollowPolicy,
  createCameraFollowSettings,
} from '../../project/camera/cursor-policy';

it.each([
  { allowExpansion: true, minimumScale: 1, x: 0.05, ready: true, expanded: true },
  { allowExpansion: false, minimumScale: 1, x: 0.05, ready: false, expanded: false },
  { allowExpansion: true, minimumScale: 2, x: 0.05, ready: false, expanded: false },
  { allowExpansion: true, minimumScale: 1, x: 0.5, ready: true, expanded: false },
])(
  'proves the complete shared temporary link fit %j',
  ({ allowExpansion, minimumScale, x, ready, expanded }) => {
    const window = { x: 0, y: 0, width: 1000, height: 600 };
    const policy = resolveCameraFollowPolicy({
      defaults: { ...createCameraFollowSettings('calm'), allowExpansion, minimumScale },
    });
    const adapter = createWindowCameraLinkGeometry({
      output: window,
      window,
      video: window,
      cornerRadius: 0,
      windowWeight: 'window',
      type: 'ease-in-out',
      from: { end: 1, scale: 2, pan: { x: 500, y: 300 } },
      to: { start: 3, scale: 2, pan: { x: 500, y: 300 } },
      policy,
    });
    const observations = [1, 2, 3].map((time) => ({
      time,
      segmentId: 'source',
      actual: { x: time === 2 ? x : 0.5, y: 0.5 },
    }));
    const proof = planWindowCameraGap({
      adapter,
      start: 1,
      end: 3,
      targetScale: 2,
      toPan: { x: 500, y: 300 },
      policy,
      observations,
    });
    expect(proof.status).toBe(ready ? 'proven' : 'conflict');
    if (proof.status !== 'proven') return;
    expect(!!proof.fit).toBe(expanded);
    if (!proof.fit) return;
    const before = structuredClone(proof.fit);
    expect(evaluateWindowCameraLinkFit(proof.fit, 1)).toEqual(proof.fit.poses[0]);
    expect(evaluateWindowCameraLinkFit(proof.fit, 3)).toEqual(proof.fit.poses.at(-1));
    const a = proof.fit.poses[0]!,
      b = proof.fit.poses[1]!;
    const automatic = createWindowCameraLinkGeometry({
      ...adapter.input,
      automaticPhase: proof.fit.phases[0]!,
      from: { ...adapter.input.from, end: a.time, scale: a.scale, pan: a.pan },
      to: { ...adapter.input.to, start: b.time, scale: b.scale, pan: b.pan },
    });
    const motion = automatic.geometry.motionBounds!({
      start: a.time,
      end: b.time,
      pan: { minX: b.pan.x, maxX: b.pan.x, minY: b.pan.y, maxY: b.pan.y },
      targetScale: b.scale,
    })!;
    expect(motion.speed).toBeGreaterThan(0);
    const mid = (a.time + b.time) / 2,
      dt = 1e-5;
    const left = evaluateWindowCameraLinkFit(proof.fit, mid - dt),
      right = evaluateWindowCameraLinkFit(proof.fit, mid + dt);
    expect(
      Math.hypot(right.pan.x - left.pan.x, right.pan.y - left.pan.y) / (2 * dt)
    ).toBeLessThanOrEqual(motion.speed);
    for (let time = 1; time <= 3; time += 1 / 120) {
      const actualX = time <= 2 ? 0.5 + (x - 0.5) * (time - 1) : x + (0.5 - x) * (time - 2);
      const pose = evaluateWindowCameraLinkFit(proof.fit, time);
      expect(pose.scale * actualX * window.width - pose.pan.x).toBeGreaterThanOrEqual(-2);
      expect(pose.pan.x).toBeGreaterThanOrEqual(-1e-8);
      expect(pose.pan.x).toBeLessThanOrEqual((pose.scale - 1) * window.width + 1e-8);
    }
    expect(proof.fit).toEqual(before);
  }
);

it('keeps independent captured observations on both sides of a link discontinuity', () => {
  const window = { x: 0, y: 0, width: 1000, height: 600 };
  const policy = resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('calm') });
  const adapter = createWindowCameraLinkGeometry({
    output: window,
    window,
    video: window,
    cornerRadius: 0,
    windowWeight: 'window',
    type: 'ease-in-out',
    from: { end: 1, scale: 2, pan: { x: 500, y: 300 } },
    to: { start: 3, scale: 2, pan: { x: 500, y: 300 } },
    policy,
  });
  const observations = [
    { time: 1, segmentId: 'left', actual: { x: 0.5, y: 0.5 } },
    { time: 2, segmentId: 'left', actual: { x: 0.05, y: 0.5 } },
    { time: 2, segmentId: 'right', actual: { x: 0.95, y: 0.5 } },
    { time: 3, segmentId: 'right', actual: { x: 0.5, y: 0.5 } },
  ];
  const result = planWindowCameraGap({
    adapter,
    start: 1,
    end: 3,
    targetScale: 2,
    toPan: { x: 500, y: 300 },
    policy,
    observations,
  });
  expect(result.status).toBe('proven');
  if (result.status === 'proven') expect(evaluateWindowCameraLinkFit(result.fit!, 2).scale).toBe(1);
});

it('fits a full-frame interior between unequal frozen endpoint scales', () => {
  const window = { x: 0, y: 0, width: 1000, height: 600 };
  const policy = resolveCameraFollowPolicy({ defaults: createCameraFollowSettings('calm') });
  const adapter = createWindowCameraLinkGeometry({
    output: window,
    window,
    video: window,
    cornerRadius: 0,
    windowWeight: 'window',
    type: 'ease-in-out',
    policy,
    from: { end: 1, scale: 1, pan: { x: 0, y: 0 } },
    to: { start: 3, scale: 1.3, pan: { x: 150, y: 90 } },
  });
  const result = planWindowCameraGap({
    adapter,
    start: 1,
    end: 3,
    targetScale: 1.3,
    toPan: adapter.input.to.pan,
    policy,
    observations: [1, 2, 3].map((time) => ({
      time,
      segmentId: 'source',
      actual: { x: time === 2 ? 0.05 : 0.5, y: 0.5 },
    })),
  });
  expect(result.status).toBe('proven');
  if (result.status !== 'proven') return;
  expect(result.fit).toBeDefined();
  expect(evaluateWindowCameraLinkFit(result.fit!, 1)).toMatchObject({
    scale: 1,
    pan: { x: 0, y: 0 },
  });
  expect(evaluateWindowCameraLinkFit(result.fit!, 2).scale).toBe(1);
  expect(evaluateWindowCameraLinkFit(result.fit!, 3)).toMatchObject({
    scale: 1.3,
    pan: { x: 150, y: 90 },
  });
});

it.each(['none', 'instant', 'linear'] as const)(
  'preserves detailed native admission across %s phase boundaries and interior pointer excursions',
  (type) => {
    const geometry = createWindowCameraGeometry({
      output: { width: 1000, height: 600 },
      window: { x: 0, y: 0, width: 1000, height: 600 },
      video: { x: 0, y: 0, width: 1000, height: 600 },
      cornerRadius: 24,
      windowWeight: 'window',
      region: { start: 0, end: 1, enter: { type, duration: 0.1 }, exit: { type, duration: 0.1 } },
      connectedIn: false,
      connectedOut: false,
      policy: resolveCameraFollowPolicy({}),
    });
    const span: CameraPlanSpan = {
      kind: 'hold',
      start: 0,
      end: 1,
      segmentId: 'source',
      pan: { x: 500, y: 300 },
    };
    const observations = Array.from({ length: 1025 }, (_, index) => ({
      time: index / 1024,
      segmentId: 'source',
      actual: { x: 0.4 + (index % 7) / 1000, y: 0.4 + (index % 11) / 1000 },
    }));
    const input = {
      spans: [span],
      observations,
      geometry,
      targetScale: 2,
      preservePointer: true,
      limits: { speed: 1e9, acceleration: 1e9, jerk: 1e9 },
    };
    const detailed = { ...geometry, supportsObservationBounds: false };
    expect(proveCameraPlan(input)).toEqual({ status: 'proven' });
    expect(proveCameraPlan(input)).toEqual(proveCameraPlan({ ...input, geometry: detailed }));
    const unsafe = observations.map((point, index) =>
      index === 511 ? { ...point, actual: { x: 0.999, y: 0.4 } } : point
    );
    expect(proveCameraPlan({ ...input, observations: unsafe }).status).toBe('conflict');
    expect(proveCameraPlan({ ...input, observations: unsafe })).toEqual(
      proveCameraPlan({ ...input, observations: unsafe, geometry: detailed })
    );
  }
);

it('retains the same native projection throughout a dense held camera phase', () => {
  let reads = 0;
  const perspective = { enabled: true, rotateX: 12, rotateY: -8, rotateZ: 5, strength: 0.5 };
  const region = {
    start: 0,
    end: 10,
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
    get perspective() {
      reads++;
      return perspective;
    },
  };
  const geometry = createWindowCameraGeometry({
    output: { width: 1000, height: 600 },
    window: { x: 20, y: 20, width: 960, height: 560 },
    video: { x: 20, y: 20, width: 960, height: 560 },
    cornerRadius: 24,
    windowWeight: 'window',
    region,
    connectedIn: false,
    connectedOut: false,
    policy: resolveCameraFollowPolicy({}),
  });
  const frame = { time: 1, x: 0.4, y: 0.4, actual: { x: 0.4, y: 0.4 }, segmentId: 'source' };
  const preferred = geometry.preferredPan(frame, 2);
  const bounds = geometry.pointPanBounds!(frame, 2, 0.1);
  reads = 0;
  for (let index = 0; index < 1025; index++) {
    const moved = { ...frame, time: 1 + index / 1024 };
    expect(geometry.preferredPan(moved, 2)).toEqual(preferred);
    expect(geometry.pointPanBounds!(moved, 2, 0.1)).toEqual(bounds);
  }
  expect(reads).toBeLessThan(10);
});

it.each(['window', 'content', 'spatial'] as const)(
  'preserves changing phases and scales in retained %s projections',
  (windowWeight) => {
    const input = {
      output: { width: 1000, height: 600 },
      window: { x: 20, y: 30, width: 960, height: 540 },
      video: { x: 20, y: 30, width: 960, height: 540 },
      cornerRadius: 24,
      windowWeight,
      region: {
        start: 0,
        end: 10,
        enter: { type: 'linear' as const, duration: 2 },
        exit: { type: 'linear' as const, duration: 2 },
        perspective: { enabled: true, rotateX: 12, rotateY: -8, rotateZ: 5, strength: 0.5 },
      },
      connectedIn: false,
      connectedOut: false,
      policy: resolveCameraFollowPolicy({}),
    };
    const retained = createWindowCameraGeometry(input);
    for (const time of [0, 0.5, 1, 2, 5, 8, 9, 10, 1, 5])
      for (const scale of [1, 1.5, 2, 3, 1.5]) {
        const frame = { time, x: 0.4, y: 0.6, actual: { x: 0.5, y: 0.3 }, segmentId: 'source' };
        const fresh = createWindowCameraGeometry(input);
        expect(retained.preferredPan(frame, scale)).toEqual(fresh.preferredPan(frame, scale));
        expect(retained.pointPanBounds!(frame, scale, 0.1)).toEqual(
          fresh.pointPanBounds!(frame, scale, 0.1)
        );
      }
  }
);

it('bounds the rendered cursor perspective when a linked endpoint has an enabled neutral base', async () => {
  const { createWindowCameraLinkGeometry } = await import('./window-camera-geometry');
  const { quickEditPlaneProjection, projectQuickEditPoint } = await import('./spatial-geometry');
  const { interpolateCameraSpatial } = await import('../../project/motion/spatial');
  const window = { x: 100, y: 80, width: 800, height: 450 };
  const base = { enabled: true, rotateX: 0, rotateY: 0, rotateZ: 0, strength: 1 };
  const offset = { x: -12, y: -18 };
  const adapter = createWindowCameraLinkGeometry({
    output: { width: 1000, height: 650 },
    window,
    video: window,
    cornerRadius: 0,
    windowWeight: 'window',
    type: 'linear',
    policy: resolveCameraFollowPolicy({}),
    from: { end: 0, scale: 1, pan: { x: 0, y: 0 }, perspective: base, cursorOffset: offset },
    to: { start: 1, scale: 1, pan: { x: 0, y: 0 }, perspective: base, cursorOffset: offset },
  });
  const actual = { x: 0.8, y: 0.2 };
  const bounds = adapter.geometry.clearanceBounds({
    start: 0.5,
    end: 0.5,
    segmentId: 'cursor',
    targetScale: 1,
    pan: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    actual: { from: actual, to: actual },
  })!;
  const settings = { perspective: { ...base, rotateX: offset.x, rotateY: offset.y } };
  const rendered = interpolateCameraSpatial(settings, settings, 0.5);
  const projection = quickEditPlaneProjection(window, window, rendered);
  const point = projectQuickEditPoint(projection, {
    x: window.x + actual.x * window.width,
    y: window.y + actual.y * window.height,
  })!;
  const clearance = Math.min(point.x, point.y, 1000 - point.x, 650 - point.y);
  expect(clearance).toBeGreaterThanOrEqual(bounds.viewport!.low - 1e-7);
  expect(clearance).toBeLessThanOrEqual(bounds.viewport!.high + 1e-7);
});

it.each([
  { amount: 0.41, x: 0.2, y: 0.5, preservePointer: true },
  { amount: 1, x: 0.2, y: 0.5, preservePointer: true },
  ...[0, 1].flatMap((x) => [0, 1].map((y) => ({ amount: 1, x, y, preservePointer: false }))),
])(
  'admits automatic orbit through a short authored exit without depending on zoom-out recovery (amount$amount,x$x,y$y)',
  async ({ amount, x, y, preservePointer }) => {
    const { createCursorOrientationPlan } = await import('./cursor-orientation');
    const { planWorkingZoneCamera } = await import('./follow-cursor');
    const settings = { mode: 'orbit' as const, amount, smoothness: 0.6 };
    const defaults = resolveCameraFollowPolicy({});
    const policy = { ...defaults, settings: { ...defaults.settings, preservePointer } };
    const orientationPlan = createCursorOrientationPlan({
      settings,
      start: 0,
      end: 3,
      observations: [
        { time: 0, x, y },
        { time: 3, x, y },
      ],
    })!;
    const geometry = createWindowCameraGeometry({
      output: { width: 1904, height: 1072 },
      window: { x: 77, y: 40, width: 1750, height: 992 },
      video: { x: 77, y: 128, width: 1750, height: 904 },
      cornerRadius: 12,
      windowWeight: 'window',
      policy,
      orientationPlan,
      region: {
        start: 0,
        end: 3,
        cursorComposition: settings,
        enter: { type: 'ease-in-out', duration: 0.3 },
        exit: { type: 'ease-in-out', duration: 0.15 },
      },
      connectedIn: false,
      connectedOut: false,
    });
    const frames = [0, 3].map((time) => ({
      time,
      x: 0.5,
      y: 0.5,
      actual: { x: 0.5, y: 0.5 },
      segmentId: 'capture',
    }));
    for (const targetScale of [1.15, 1]) {
      const plan = planWorkingZoneCamera({
        frames,
        start: 0,
        end: 3,
        targetScale,
        policy,
        geometry,
      });
      expect(plan.status, JSON.stringify({ targetScale, plan })).toBe('ready');
    }
  }
);

it.each(['window', 'content', 'spatial'] as const)(
  'bounds the independently activated cursor pose rendered during the authored short exit (%s)',
  async (windowWeight) => {
    const {
      createCursorActivationPlan,
      createCursorOrientationPlan,
      evaluateCursorActivation,
      evaluateCursorOrientation,
    } = await import('./cursor-orientation');
    const { createCameraTrajectory, evaluateCameraTrajectory } =
      await import('./camera-trajectory');
    const { boundQuickEditCameraProjection } = await import('./spatial-projection-bounds');
    const { cameraPerspectiveWithCursor, interpolateCameraSpatial } =
      await import('../../project/motion/spatial');
    const { quickEditPlaneProjection, projectQuickEditPoint } = await import('./spatial-geometry');
    const settings = { mode: 'orbit' as const, amount: 0.41, smoothness: 0.6 };
    const plan = createCursorOrientationPlan({
      settings,
      start: 0,
      end: 3,
      observations: [
        { time: 0, x: 0.2, y: 0.5 },
        { time: 3, x: 0.2, y: 0.5 },
      ],
    })!;
    const activation = createCursorActivationPlan({
      start: 0,
      end: 3,
      enterDuration: 0.15,
      exitDuration: 0.15,
    });
    const nominal = createCameraTrajectory({
      start: 2.85,
      end: 3,
      from: { x: 1, y: 0 },
      to: { x: 0, y: 0 },
    });
    const window = { x: 77, y: 40, width: 1750, height: 992 },
      video = { x: 77, y: 128, width: 1750, height: 904 };
    const pan = { x: 131.25, y: 74.4 };
    for (let index = 0; index <= 20; index++) {
      const time = 2.85 + (index * 0.15) / 20,
        progress = evaluateCameraTrajectory(nominal, time).x;
      const proof = boundQuickEditCameraProjection({
        start: time,
        end: time,
        window,
        video,
        output: { width: 1904, height: 1072 },
        cornerRadius: 12,
        targetScale: 1.15,
        phase: nominal,
        windowWeight,
        pan: { minX: pan.x, maxX: pan.x, minY: pan.y, maxY: pan.y },
        perspective: { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 1 },
        orbit: { angles: plan.spans[0]!, phase: activation.exit! },
        actual: { from: { x: 0.5, y: 0.5 }, to: { x: 0.5, y: 0.5 } },
      })!;
      const target = cameraPerspectiveWithCursor(
        { cursorComposition: settings },
        evaluateCursorOrientation(plan, time)
      );
      const spatial = interpolateCameraSpatial(null, target, progress, {
        from: false,
        to: true,
        progress: evaluateCursorActivation(activation, time),
      });
      const scale = 1 + 0.15 * progress;
      const weight =
        windowWeight === 'window' ? 1 : windowWeight === 'content' ? 0 : spatial.windowMotion;
      const k = 1 + weight * (scale - 1);
      const targetWindow = {
        x: window.x - weight * pan.x * progress,
        y: window.y - weight * pan.y * progress,
        width: window.width * k,
        height: window.height * k,
      };
      const projection = quickEditPlaneProjection(window, targetWindow, spatial);
      const actual = {
        x: window.x + scale * (video.x + video.width / 2 - window.x) - pan.x * progress,
        y: window.y + scale * (video.y + video.height / 2 - window.y) - pan.y * progress,
      };
      const point = projectQuickEditPoint(projection, {
        x: window.x + (actual.x - targetWindow.x) / k,
        y: window.y + (actual.y - targetWindow.y) / k,
      })!;
      const clearance = Math.min(point.x, point.y, 1904 - point.x, 1072 - point.y);
      expect(clearance).toBeGreaterThanOrEqual(proof.viewport!.low - 1e-7);
      expect(clearance).toBeLessThanOrEqual(proof.viewport!.high + 1e-7);
    }
  }
);

it.each([0.2, 0.65, 5])(
  'respects the resolved movement duration %s during automatic activation at default strength and normalized corners',
  async (movementDuration) => {
    const { createCursorOrientationPlan } = await import('./cursor-orientation');
    const { planWorkingZoneCamera } = await import('./follow-cursor');
    const defaults = resolveCameraFollowPolicy({});
    const policy = {
      ...defaults,
      settings: {
        ...defaults.settings,
        transitionDuration: movementDuration,
        preservePointer: false,
      },
    };
    const cases = [
      { amount: 0.5, x: 0.2, y: 0.5 },
      ...[0, 1].flatMap((x) => [0, 1].map((y) => ({ amount: 1, x, y }))),
    ];
    for (const { amount, x, y } of cases) {
      const settings = { mode: 'orbit' as const, amount, smoothness: 0.6 };
      const orientationPlan = createCursorOrientationPlan({
        settings,
        start: 0,
        end: 30,
        observations: [
          { time: 0, x, y },
          { time: 30, x, y },
        ],
      })!;
      const geometry = createWindowCameraGeometry({
        orientationPlan,
        output: { width: 1904, height: 1072 },
        window: { x: 77, y: 40, width: 1750, height: 992 },
        video: { x: 77, y: 128, width: 1750, height: 904 },
        cornerRadius: 12,
        windowWeight: 'window',
        policy,
        region: {
          start: 0,
          end: 30,
          cursorComposition: settings,
          enter: { type: 'ease-in-out', duration: 0.15 },
          exit: { type: 'ease-in-out', duration: 0.15 },
        },
        connectedIn: false,
        connectedOut: false,
      });
      const frames = [0, 30].map((time) => ({ time, x: 0.5, y: 0.5, segmentId: 'capture' }));
      const plan = planWorkingZoneCamera({
        frames,
        start: 0,
        end: 30,
        targetScale: 1.3,
        policy,
        geometry,
      });
      expect(plan.status, JSON.stringify({ movementDuration, amount, x, y, plan })).toBe('ready');
    }
  }
);
