import type { VideoEditorPreviewRasterPreset } from './preferences';
import type { QuickPreviewPreferences } from './quick-preferences';

type Size = { width: number; height: number };
const HEIGHTS: Record<VideoEditorPreviewRasterPreset, number> = {
  '360p': 360,
  '540p': 540,
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 3840 * 2160;

function roundEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function capRaster(width: number, height: number): Size {
  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(width, height),
    Math.sqrt(MAX_PIXELS / (width * height))
  );
  const quantize =
    scale < 1 ? (value: number) => Math.max(2, Math.floor(value / 2) * 2) : roundEven;
  return { width: quantize(width * scale), height: quantize(height * scale) };
}

/** Named preview presets describe vertical resolution, including portrait scenes. */
export function resolvePreviewRasterSize(
  scene: Size,
  preset: VideoEditorPreviewRasterPreset
): Size {
  const width = Math.max(1, scene.width);
  const height = Math.max(1, scene.height);
  return capRaster(roundEven((width / height) * HEIGHTS[preset]), HEIGHTS[preset]);
}

/** Backing pixels only: canonical scene coordinates and CSS hit geometry remain unchanged. */
export function resolveQuickPreviewRasterSize(args: {
  canonical: Size;
  css: Size;
  dpr: number;
  rasterPreset: QuickPreviewPreferences['rasterPreset'];
  pausedQuality: QuickPreviewPreferences['pausedQuality'];
  paused: boolean;
}): Size {
  const { canonical, css, dpr } = args;
  if (
    ![canonical.width, canonical.height, css.width, css.height, dpr].every(
      (value) => Number.isFinite(value) && value > 0
    )
  )
    throw new RangeError('Preview dimensions must be finite and positive.');
  if (args.rasterPreset !== 'current' && !(args.paused && args.pausedQuality === 'detailed'))
    return resolvePreviewRasterSize(canonical, args.rasterPreset);
  let scale =
    args.rasterPreset === 'current'
      ? Math.min(css.width / canonical.width, css.height / canonical.height) * Math.min(dpr, 2)
      : HEIGHTS[args.rasterPreset] / canonical.height;
  if (args.paused && args.pausedQuality === 'detailed') scale = Math.max(1, scale);
  return capRaster(roundEven(canonical.width * scale), roundEven(canonical.height * scale));
}
