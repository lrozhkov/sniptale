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

function resolveAnimationCycle(time: number, speed: number, multiplier = 0.24): number {
  const resolvedSpeed = Math.max(0, speed) / 100;
  return Math.sin(time * Math.PI * 2 * resolvedSpeed * multiplier);
}

function resolveAnimationPulse(time: number, speed: number, multiplier = 0.24): number {
  return (resolveAnimationCycle(time, speed, multiplier) + 1) / 2;
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
  const animation = params.animation;
  if (!animation || animation.mode === VideoSceneGradientAnimationMode.NONE) {
    return { angle: params.angle, fromStop: 0, toStop: 100 };
  }

  const intensityRatio = animation.intensity / 100;
  switch (animation.mode) {
    case VideoSceneGradientAnimationMode.ROTATE: {
      const drift = resolveAnimationCycle(params.time, animation.speed);
      const stopPulse = resolveAnimationPulse(params.time + 0.35, animation.speed, 0.18);
      const angleOffset = drift * intensityRatio * 28;
      const stopOffset = (4 + stopPulse * 10) * intensityRatio;
      return {
        angle: clampSceneBackgroundAngle(params.angle + angleOffset),
        fromStop: stopOffset,
        toStop: 100 - stopOffset * 0.65,
      };
    }
    case VideoSceneGradientAnimationMode.BREATHE: {
      const spotlight = resolveAnimationPulse(params.time, animation.speed, 0.16);
      const angleDrift = resolveAnimationCycle(params.time + 0.5, animation.speed, 0.12);
      const fromStop = (6 + spotlight * 18) * intensityRatio;
      const toStop = 100 - (10 + (1 - spotlight) * 14) * intensityRatio;
      return {
        angle: clampSceneBackgroundAngle(params.angle + angleDrift * intensityRatio * 12),
        fromStop,
        toStop,
      };
    }
    case VideoSceneGradientAnimationMode.AUDIO_REACTIVE: {
      const envelope = resolveTransientEnvelope(params.audioEnvelope);
      const angleOffset = envelope * intensityRatio * 78;
      const stopOffset = envelope * intensityRatio * 30;
      return {
        angle: clampSceneBackgroundAngle(params.angle + angleOffset),
        fromStop: stopOffset,
        toStop: 100 - stopOffset,
      };
    }
  }
}
