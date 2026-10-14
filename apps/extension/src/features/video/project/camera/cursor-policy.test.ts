import { expect, it } from 'vitest';
import {
  createCameraFollowSettings,
  resolveCameraFollowPolicy,
  cameraFollowMotionLimits,
  cameraFollowPreset,
  applyCameraFollowPreset,
} from './cursor-policy';
import {
  createCameraTrajectory,
  cameraTrajectoryDynamics,
} from '../../composition/motion/camera-trajectory';

it('keeps legacy movement coefficients when only zone size is overridden', () => {
  const inherited = resolveCameraFollowPolicy({ legacySensitivity: 0.7 });
  const overridden = resolveCameraFollowPolicy({
    override: { ...inherited.settings, zoneSize: 0.8 },
  });
  expect(overridden.legacy).toEqual(inherited.legacy);
});

it('inherits defaults, gives a region override priority and restores inheritance after reset', () => {
  const defaults = createCameraFollowSettings('calm');
  const override = { ...createCameraFollowSettings('fast'), zoneSize: 0.25 };
  expect(resolveCameraFollowPolicy({ defaults }).settings).toEqual(defaults);
  expect(resolveCameraFollowPolicy({ defaults, override })).toMatchObject({
    source: 'override',
    settings: override,
  });
  expect(resolveCameraFollowPolicy({ defaults })).toMatchObject({
    source: 'defaults',
    settings: defaults,
  });
  const resolved = resolveCameraFollowPolicy({ defaults });
  resolved.settings.zoneSize = 1;
  expect(defaults.zoneSize).toBe(0.55);
});

it('couples physical bounds to the named duration and scales consistently with output resolution', () => {
  const settings = createCameraFollowSettings();
  const policy = resolveCameraFollowPolicy({ defaults: settings });
  const size = {
    viewportWidth: 640,
    viewportHeight: 480,
    windowWidth: 640,
    windowHeight: 480,
    minimumScale: 2,
  };
  const limits = cameraFollowMotionLimits(policy, size);
  const transition = createCameraTrajectory({
    start: 0,
    end: settings.transitionDuration,
    from: { x: 0, y: 0 },
    to: { x: 640, y: 480 },
  });
  const dynamics = cameraTrajectoryDynamics(transition);
  for (const field of ['speed', 'acceleration', 'jerk'] as const) {
    expect(dynamics[field]).toBeGreaterThanOrEqual(limits[field] * 0.999999);
    expect(dynamics[field]).toBeLessThanOrEqual(limits[field] * 1.001);
    const doubled = cameraFollowMotionLimits(policy, {
      ...size,
      viewportWidth: 1280,
      viewportHeight: 960,
      windowWidth: 1280,
      windowHeight: 960,
    });
    expect(doubled[field] / limits[field]).toBeCloseTo(2, 9);
  }
});

it('changes movement presets without changing zone size or increasing nominal zoom', () => {
  const size = {
    viewportWidth: 800,
    viewportHeight: 600,
    windowWidth: 800,
    windowHeight: 600,
    minimumScale: 2,
  };
  const settings = (['calm', 'balanced', 'fast'] as const).map(createCameraFollowSettings);
  const speeds = settings.map(
    (value) => cameraFollowMotionLimits(resolveCameraFollowPolicy({ defaults: value }), size).speed
  );
  expect(speeds[0]).toBeLessThan(speeds[1]!);
  expect(speeds[1]).toBeLessThan(speeds[2]!);
  expect(
    settings.every(
      (value) => value.zoneSize === 0.55 && !value.allowExpansion && value.minimumScale === 1
    )
  ).toBe(true);
});

it('keeps legacy sensitivity in a distinct preset without assigning it to grouping or path smoothing', () => {
  const slow = resolveCameraFollowPolicy({ legacySensitivity: 0 });
  const fast = resolveCameraFollowPolicy({ legacySensitivity: 1 });
  expect(slow.source).toBe('legacy');
  expect(fast.legacy!.speed).toBeGreaterThan(slow.legacy!.speed);
  expect(fast.settings.marginFraction).toBeGreaterThan(slow.settings.marginFraction);
  expect(fast.settings.zoneSize).toBe(slow.settings.zoneSize);
  expect(() => resolveCameraFollowPolicy({ legacySensitivity: NaN })).toThrow(
    'between zero and one'
  );
});

it('replaces legacy movement with a named preset while preserving independent camera choices', () => {
  const settings = {
    ...resolveCameraFollowPolicy({ legacySensitivity: 0.7 }).settings,
    zoneSize: 0.8,
    preservePointer: false,
    allowExpansion: true,
    minimumScale: 1.2,
  };
  const before = structuredClone(settings);
  expect(cameraFollowPreset(settings)).toBe('legacy');
  const calm = applyCameraFollowPreset(settings, 'calm');
  expect(calm).toMatchObject({
    zoneSize: 0.8,
    preservePointer: false,
    allowExpansion: true,
    minimumScale: 1.2,
    transitionDuration: 0.65,
  });
  expect(calm.legacySensitivity).toBeUndefined();
  expect(cameraFollowPreset(calm)).toBe('calm');
  expect(cameraFollowPreset({ ...calm, transitionDuration: 0.7 })).toBe('custom');
  expect(settings).toEqual(before);
});
