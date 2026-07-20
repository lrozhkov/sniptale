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

it('resolves static, light sweep, and transient-reactive animation frames', () => {
  expect(
    resolveGradientAnimationFrame({
      angle: 90,
      animation: undefined,
      audioEnvelope: 0,
      time: 2,
    })
  ).toEqual({ angle: 90, fromStop: 0, toStop: 100 });
  expect(
    resolveGradientAnimationFrame({
      angle: 90,
      animation: { mode: VideoSceneGradientAnimationMode.BREATHE, speed: 50, intensity: 50 },
      audioEnvelope: 0,
      time: 0,
    })
  ).toMatchObject({ angle: expect.closeTo(91.1, 1), fromStop: 7.5, toStop: 91.5 });
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
  ).toMatchObject({ angle: 90, fromStop: 0, toStop: 100 });
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
  ).toMatchObject({ angle: 129, fromStop: 15, toStop: 85 });
});
