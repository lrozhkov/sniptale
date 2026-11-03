import type { VideoSceneBackgroundMotion } from '../types/layout';
import { isBoundedNumber, isRecord } from '../validation/primitives';

export const DEFAULT_BACKGROUND_MOTION: VideoSceneBackgroundMotion = {
  mode: 'none',
  speed: 50,
  intensity: 50,
};

/** Stored motion is optional; malformed supplied settings reject the containing document. */
export function parseSceneBackgroundMotion(value: unknown): VideoSceneBackgroundMotion | null {
  if (!isRecord(value)) return null;
  const mode = value['mode'];
  if (
    (mode !== 'none' && mode !== 'drift' && mode !== 'glow' && mode !== 'waves') ||
    !isBoundedNumber(value['speed'], 0, 100) ||
    !isBoundedNumber(value['intensity'], 0, 100)
  )
    return null;
  return { mode, speed: value['speed'], intensity: value['intensity'] };
}

/** A zero amount or speed preserves the original paint exactly. */
export function hasSceneBackgroundMotion(motion: VideoSceneBackgroundMotion | undefined) {
  return !!motion && motion.mode !== 'none' && motion.speed > 0 && motion.intensity > 0;
}

/** Pure programme-time evaluation: pause, reverse seek and export require no playback state. */
export function evaluateSceneBackgroundMotion(
  motion: VideoSceneBackgroundMotion,
  currentTime: number
) {
  const time = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const t = ((((time * motion.speed) / 50) % 120) + 120) % 120;
  const amount = motion.intensity / 100;
  const phase = Math.PI * 2 * t;
  const zoom = 1 + amount * (0.15 + 0.07 * Math.sin(phase / 20));
  const margin = 0.375 * (1 - 1 / zoom);
  return {
    time: t,
    amount,
    zoom,
    offsetX: margin * Math.sin(phase / 15),
    offsetY: margin * Math.cos(phase / 24),
    lights: [
      { x: 0.5 + 0.35 * Math.sin(phase / 10), y: 0.5 + 0.25 * Math.sin(phase / 15 + 1) },
      { x: 0.5 + 0.3 * Math.sin(phase / 12 + 2), y: 0.5 + 0.22 * Math.cos(phase / 20) },
      { x: 0.5 + 0.25 * Math.cos(phase / 15 + 4), y: 0.5 + 0.28 * Math.sin(phase / 12 + 3) },
    ],
  };
}
