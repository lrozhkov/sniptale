import { expect, it } from 'vitest';
import {
  clampSceneBackgroundAngle,
  normalizeGradientAnimation,
  resolveGradientAnimationFrame,
} from './background-animation';
import { VideoSceneGradientAnimationMode } from '../types/index';

it('normalizes angles and invalid animation numbers deterministically', () => {
  expect(clampSceneBackgroundAngle(-45)).toBe(315);
  expect(clampSceneBackgroundAngle(Number.NaN)).toBe(135);
  expect(
    normalizeGradientAnimation({
      mode: VideoSceneGradientAnimationMode.ROTATE,
      speed: Number.NaN,
      intensity: 200,
    })
  ).toEqual({
    mode: VideoSceneGradientAnimationMode.ROTATE,
    speed: 40,
    intensity: 100,
  });
  expect(
    normalizeGradientAnimation({
      mode: 'legacy-spin' as VideoSceneGradientAnimationMode,
      speed: 20,
      intensity: 20,
    })
  ).toEqual({
    mode: VideoSceneGradientAnimationMode.NONE,
    speed: 20,
    intensity: 20,
  });
});

it('resolves static, light sweep, and audio-reactive animation frames', () => {
  expect(
    resolveGradientAnimationFrame({
      angle: 90,
      animation: undefined,
      audioEnvelope: 0,
      time: 2,
    })
  ).toMatchObject({ angle: 90, fromStop: 0, toStop: 100 });
  expect(
    resolveGradientAnimationFrame({
      angle: 90,
      animation: { mode: VideoSceneGradientAnimationMode.BREATHE, speed: 50, intensity: 50 },
      audioEnvelope: 0,
      time: 0,
    })
  ).toMatchObject({ angle: 90, fromStop: 0, toStop: 100 });
  expect(
    resolveGradientAnimationFrame({
      angle: 90,
      animation: {
        mode: VideoSceneGradientAnimationMode.AUDIO_REACTIVE,
        speed: 50,
        intensity: 50,
      },
      audioEnvelope: 0.15,
      time: 0,
    })
  ).not.toMatchObject({ angle: 90, fromStop: 0, toStop: 100 });
  expect(
    resolveGradientAnimationFrame({
      angle: 90,
      animation: {
        mode: VideoSceneGradientAnimationMode.AUDIO_REACTIVE,
        speed: 50,
        intensity: 50,
      },
      audioEnvelope: 1,
      time: 0,
    })
  ).toMatchObject({ offsetX: expect.any(Number), offsetY: expect.any(Number) });
});

it('keeps zero speed and zero intensity visually neutral', () => {
  for (const mode of [
    VideoSceneGradientAnimationMode.ROTATE,
    VideoSceneGradientAnimationMode.BREATHE,
  ]) {
    for (const animation of [
      { mode, speed: 0, intensity: 100 },
      { mode, speed: 100, intensity: 0 },
    ]) {
      expect(
        resolveGradientAnimationFrame({ angle: 90, animation, audioEnvelope: 0, time: 3 })
      ).toMatchObject({ angle: 90, fromStop: 0, toStop: 100 });
    }
  }
});

it('changes direction under steady music and reproduces frames after arbitrary seeks', () => {
  const frame = (time: number) =>
    resolveGradientAnimationFrame({
      angle: 90,
      time,
      audioEnvelope: 0.6,
      animation: { mode: VideoSceneGradientAnimationMode.AUDIO_REACTIVE, speed: 60, intensity: 80 },
    });
  const frames = Array.from({ length: 121 }, (_, i) => frame(i));
  for (const axis of ['offsetX', 'offsetY'] as const) {
    expect(Math.min(...frames.map((f) => f[axis]))).toBeLessThan(-0.05);
    expect(Math.max(...frames.map((f) => f[axis]))).toBeGreaterThan(0.05);
  }
  for (const i of [70, 3, 90, 0, 3, 70]) expect(frame(i)).toEqual(frames[i]);
});

it('keeps motion bounded, continuous and quiet when the signal is silent', () => {
  const animation = {
    mode: VideoSceneGradientAnimationMode.AUDIO_REACTIVE,
    speed: 100,
    intensity: 100,
  };
  for (let time = 0; time < 60; time += 0.1) {
    const frame = resolveGradientAnimationFrame({ angle: 180, animation, audioEnvelope: 1, time });
    const next = resolveGradientAnimationFrame({
      angle: 180,
      animation,
      audioEnvelope: 1,
      time: time + 1 / 60,
    });
    expect(Math.abs(frame.offsetX)).toBeLessThanOrEqual(0.3);
    expect(Math.abs(frame.offsetY)).toBeLessThanOrEqual(0.24);
    expect(Math.abs(next.offsetX - frame.offsetX)).toBeLessThan(0.01);
    expect(Math.abs(next.offsetY - frame.offsetY)).toBeLessThan(0.01);
    expect(frame.radiusScale).toBeGreaterThanOrEqual(0.65);
    expect(frame.radiusScale).toBeLessThanOrEqual(1.2);
    expect(frame.fromStop).toBeLessThan(frame.toStop);
  }
  for (const overrides of [
    { audioEnvelope: 0 },
    { animation: { ...animation, intensity: 0 } },
    { animation: { ...animation, speed: 0 } },
  ]) {
    expect(
      resolveGradientAnimationFrame({
        angle: 180,
        animation,
        audioEnvelope: 1,
        time: 40,
        ...overrides,
      })
    ).toEqual({ angle: 180, offsetX: 0, offsetY: 0, fromStop: 0, toStop: 100, radiusScale: 1 });
  }
});
