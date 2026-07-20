import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
} from './types/index';
import type { VideoProjectCursorSkin, VideoProjectCursorTrack } from './types/index';

function clampCursorScale(value: number) {
  return Math.min(4, Math.max(0.2, value));
}

export function normalizeVideoProjectCursorSkin(
  skin: Partial<VideoProjectCursorSkin> | null | undefined
): VideoProjectCursorSkin {
  return {
    animationPreset:
      skin?.animationPreset &&
      Object.values(VideoCursorAnimationPreset).includes(skin.animationPreset)
        ? skin.animationPreset
        : VideoCursorAnimationPreset.NONE,
    color: typeof skin?.color === 'string' && skin.color.length > 0 ? skin.color : '#f8fafc',
    hidden: Boolean(skin?.hidden),
    preset:
      skin?.preset && Object.values(VideoCursorVisualPreset).includes(skin.preset)
        ? skin.preset
        : VideoCursorVisualPreset.ARROW,
    scale: typeof skin?.scale === 'number' ? clampCursorScale(skin.scale) : 1,
    shadow: Boolean(skin?.shadow),
  };
}

export function getDefaultCursorHidden(
  captureMode: VideoProjectCursorTrack['captureMode']
): boolean {
  return captureMode === VideoCursorCaptureMode.EMBEDDED_FALLBACK;
}
