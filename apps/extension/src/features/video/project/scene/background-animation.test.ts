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
  ).toMatchObject({ angle: 135, fromStop: 17.5, toStop: 82.5 });
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
