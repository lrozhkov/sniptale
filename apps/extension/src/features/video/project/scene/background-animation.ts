import { VideoSceneGradientAnimationMode, type VideoSceneGradientAnimation } from '../types/index';

const DEFAULT_SCENE_BACKGROUND_ANGLE = 135;
const DEFAULT_GRADIENT_ANIMATION_SPEED = 40;
const DEFAULT_GRADIENT_ANIMATION_INTENSITY = 30;

export function clampSceneBackgroundAngle(angle: number) {
  if (!Number.isFinite(angle)) {
    return DEFAULT_SCENE_BACKGROUND_ANGLE;
  }

  const normalizedAngle = angle % 360;
  return normalizedAngle >= 0 ? normalizedAngle : normalizedAngle + 360;
}

function clampSceneBackgroundNumber(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(0, value));
}

function normalizeGradientAnimationMode(
  mode: VideoSceneGradientAnimation['mode']
): VideoSceneGradientAnimation['mode'] {
  return Object.values(VideoSceneGradientAnimationMode).includes(mode)
    ? mode
    : VideoSceneGradientAnimationMode.NONE;
}

export function normalizeGradientAnimation(
  animation: VideoSceneGradientAnimation | undefined
): VideoSceneGradientAnimation | undefined {
  if (!animation) {
    return undefined;
  }

  const mode = normalizeGradientAnimationMode(animation.mode);
  if (mode === VideoSceneGradientAnimationMode.NONE) {
    return {
      mode: VideoSceneGradientAnimationMode.NONE,
      speed: clampSceneBackgroundNumber(animation.speed, DEFAULT_GRADIENT_ANIMATION_SPEED, 100),
      intensity: clampSceneBackgroundNumber(
        animation.intensity,
        DEFAULT_GRADIENT_ANIMATION_INTENSITY,
        100
      ),
    };
  }

  return {
    mode,
    speed: clampSceneBackgroundNumber(animation.speed, DEFAULT_GRADIENT_ANIMATION_SPEED, 100),
    intensity: clampSceneBackgroundNumber(
      animation.intensity,
      DEFAULT_GRADIENT_ANIMATION_INTENSITY,
      100
    ),
  };
}

function resolveTransientEnvelope(audioEnvelope: number): number {
  const envelope = clampSceneBackgroundNumber(audioEnvelope, 0, 1);
  const threshold = 0.22;
  if (envelope <= threshold) {
    return 0;
  }

  const normalizedEnvelope = (envelope - threshold) / (1 - threshold);
  return Math.min(1, Math.pow(normalizedEnvelope, 0.72));
}

export function resolveGradientAnimationFrame(params: {
  angle: number;
  animation: VideoSceneGradientAnimation | undefined;
  audioEnvelope: number;
  time: number;
}) {
  const animation = normalizeGradientAnimation(params.animation);
  const neutral = {
    angle: params.angle,
    fromStop: 0,
    toStop: 100,
    offsetX: 0,
    offsetY: 0,
    radiusScale: 1,
  };
  if (
    !animation ||
    animation.mode === VideoSceneGradientAnimationMode.NONE ||
    animation.intensity === 0
  )
    return neutral;
  const intensity = animation.intensity / 100;
  if (animation.mode === VideoSceneGradientAnimationMode.AUDIO_REACTIVE) {
    const pulse = resolveTransientEnvelope(params.audioEnvelope) * intensity;
    return {
      ...neutral,
      angle: clampSceneBackgroundAngle(params.angle + pulse * 90),
      fromStop: pulse * 35,
      toStop: 100 - pulse * 35,
      radiusScale: 1 - pulse * 0.6,
    };
  }
  if (animation.speed === 0) return neutral;
  const time = Number.isFinite(params.time) ? Math.max(0, params.time) : 0;
  const phase = ((time * Math.PI * 2 * animation.speed) / 100) * 0.16;
  const wave = Math.sin(phase);
  switch (animation.mode) {
    case VideoSceneGradientAnimationMode.ROTATE:
      return {
        ...neutral,
        angle: clampSceneBackgroundAngle(params.angle + ((phase * 180) / Math.PI) * intensity),
        offsetX: wave * 0.3 * intensity,
        offsetY: (Math.cos(phase) - 1) * 0.15 * intensity,
      };
    case VideoSceneGradientAnimationMode.BREATHE: {
      const pulse = ((1 - Math.cos(phase)) / 2) * intensity;
      return {
        ...neutral,
        fromStop: pulse * 35,
        toStop: 100 - pulse * 35,
        radiusScale: 1 - pulse * 0.65,
        angle: clampSceneBackgroundAngle(params.angle + wave * 25 * intensity),
      };
    }
    case VideoSceneGradientAnimationMode.DRIFT:
      return {
        ...neutral,
        angle: clampSceneBackgroundAngle(params.angle + wave * 65 * intensity),
        fromStop: Math.max(0, wave) * 45 * intensity,
        toStop: 100 + Math.min(0, wave) * 45 * intensity,
        offsetX: wave * 0.4 * intensity,
        offsetY: Math.sin(phase * 0.7) * 0.3 * intensity,
      };
  }
}
