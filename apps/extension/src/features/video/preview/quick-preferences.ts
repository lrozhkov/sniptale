import { VIDEO_EDITOR_PREVIEW_RASTER_PRESETS } from './preferences';

export const QUICK_PREVIEW_RASTER_PRESETS = [
  'current',
  ...VIDEO_EDITOR_PREVIEW_RASTER_PRESETS,
] as const;
export const QUICK_PREVIEW_FRAME_RATES = ['current', '60', '30', '24', '15'] as const;
export const QUICK_PREVIEW_PAUSED_QUALITIES = ['same', 'detailed'] as const;

/** Workstation presentation choices; Current preserves the existing quick-preview policy. */
export interface QuickPreviewPreferences {
  rasterPreset: (typeof QUICK_PREVIEW_RASTER_PRESETS)[number];
  frameRate: (typeof QUICK_PREVIEW_FRAME_RATES)[number];
  pausedQuality: (typeof QUICK_PREVIEW_PAUSED_QUALITIES)[number];
  showFrameRate: boolean;
}

export const DEFAULT_QUICK_PREVIEW_PREFERENCES: Readonly<QuickPreviewPreferences> = Object.freeze({
  rasterPreset: 'current',
  frameRate: 'current',
  pausedQuality: 'same',
  showFrameRate: false,
});
