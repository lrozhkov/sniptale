import { expect, it } from 'vitest';
import {
  createCameraTrajectory,
  evaluateCameraTrajectory,
  evaluateCameraTrajectoryDerivative,
  cameraTrajectoryBounds,
  cameraTrajectoryDynamics,
} from './camera-trajectory';

it('joins prescribed incoming and outgoing position, velocity and acceleration without a clamp', () => {
  const trajectory = createCameraTrajectory({
    start: 1,
    end: 3,
    from: { x: -25, y: 30 },
    to: { x: 80, y: -10 },
    fromVelocity: { x: 4, y: -2 },
    toVelocity: { x: -3, y: 7 },
    fromAcceleration: { x: 2, y: 1 },
    toAcceleration: { x: -5, y: 3 },
  });
  expect(evaluateCameraTrajectory(trajectory, 1)).toEqual({ x: -25, y: 30 });
  expect(evaluateCameraTrajectory(trajectory, 3)).toEqual({ x: 80, y: -10 });
  for (const [time, velocity, acceleration] of [
    [1, [4, -2], [2, 1]],
    [3, [-3, 7], [-5, 3]],
  ] as const) {
    const v = evaluateCameraTrajectoryDerivative(trajectory, time, 1);
    const a = evaluateCameraTrajectoryDerivative(trajectory, time, 2);
    expect(v.x).toBeCloseTo(velocity[0], 6);
    expect(v.y).toBeCloseTo(velocity[1], 6);
    expect(a.x).toBeCloseTo(acceleration[0], 6);
    expect(a.y).toBeCloseTo(acceleration[1], 6);
  }
  const middle = evaluateCameraTrajectory(trajectory, 1.6);
  evaluateCameraTrajectory(trajectory, 2.7);
  expect(evaluateCameraTrajectory(trajectory, 1.6)).toEqual(middle);
});

it('bounds analytic minimum-jerk extrema over complete and partial intervals', () => {
  const trajectory = createCameraTrajectory({
    start: 0,
    end: 2,
    from: { x: 0, y: 0 },
    to: { x: 100, y: 0 },
  });
  const dynamics = cameraTrajectoryDynamics(trajectory);
  const exact = {
    speed: (100 * 1.875) / 2,
    acceleration: (100 * 10 * Math.sqrt(3)) / 3 / 4,
    jerk: (100 * 60) / 8,
  };
  for (const name of ['speed', 'acceleration', 'jerk'] as const) {
    expect(dynamics[name]).toBeGreaterThanOrEqual(exact[name] - 1e-9);
    expect(dynamics[name]).toBeLessThanOrEqual(exact[name] * 1.001);
  }
  const bounds = cameraTrajectoryBounds(trajectory, 0.4, 1.2);
  for (const t of [0.4, 0.5, 0.8, 1, 1.2]) {
    const point = evaluateCameraTrajectory(trajectory, t);
    expect(point.x).toBeGreaterThanOrEqual(bounds.minX - 1e-9);
    expect(point.x).toBeLessThanOrEqual(bounds.maxX + 1e-9);
  }
  expect(bounds.minX).toBeGreaterThan(0);
  expect(bounds.maxX).toBeLessThan(100);
});

it('rescales physical derivatives with output duration and refuses invalid boundaries', () => {
  const make = (end: number) =>
    createCameraTrajectory({ start: 0, end, from: { x: 0, y: 0 }, to: { x: 30, y: 40 } });
  const slow = cameraTrajectoryDynamics(make(2));
  const fast = cameraTrajectoryDynamics(make(1));
  expect(fast.speed / slow.speed).toBeCloseTo(2, 9);
  expect(fast.acceleration / slow.acceleration).toBeCloseTo(4, 9);
  expect(fast.jerk / slow.jerk).toBeCloseTo(8, 9);
  expect(() => make(0)).toThrow('positive finite duration');
  expect(() =>
    createCameraTrajectory({ start: 0, end: 1, from: { x: NaN, y: 0 }, to: { x: 0, y: 0 } })
  ).toThrow('finite boundary');
});
