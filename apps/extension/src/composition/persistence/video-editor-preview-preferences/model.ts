import {
  VIDEO_EDITOR_PREVIEW_MODES,
  VIDEO_EDITOR_PREVIEW_RASTER_PRESETS,
  VIDEO_EDITOR_PREVIEW_ZOOM_LEVELS,
  type VideoEditorPreviewMode,
  type VideoEditorPreviewRasterPreset,
  type VideoEditorPreviewZoom,
} from '../../../features/video/preview/preferences';

export {
  VIDEO_EDITOR_PREVIEW_MODES,
  VIDEO_EDITOR_PREVIEW_RASTER_PRESETS,
  VIDEO_EDITOR_PREVIEW_ZOOM_LEVELS,
};
export type { VideoEditorPreviewMode, VideoEditorPreviewRasterPreset, VideoEditorPreviewZoom };

export interface VideoEditorPreviewPreferences {
  mode: VideoEditorPreviewMode;
  rasterPreset: VideoEditorPreviewRasterPreset;
  zoom: VideoEditorPreviewZoom;
}

export const DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES: VideoEditorPreviewPreferences = {
  mode: 'live',
  rasterPreset: '720p',
  zoom: 'fit',
};

interface ParsedVideoEditorPreviewPreferences {
  invalidFieldCount: number;
  preferences: VideoEditorPreviewPreferences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includesValue<const Values extends readonly string[]>(
  values: Values,
  value: unknown
): value is Values[number] {
  return typeof value === 'string' && values.some((candidate) => candidate === value);
}

export function parseVideoEditorPreviewPreferences(
  value: unknown
): ParsedVideoEditorPreviewPreferences {
  if (value === undefined) {
    return { invalidFieldCount: 0, preferences: DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES };
  }
  if (!isRecord(value)) {
    return { invalidFieldCount: 1, preferences: DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES };
  }

  const preferences = { ...DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES };
  let invalidFieldCount = 0;
  if (includesValue(VIDEO_EDITOR_PREVIEW_MODES, value['mode'])) preferences.mode = value['mode'];
  else if (value['mode'] !== undefined) invalidFieldCount += 1;
  if (includesValue(VIDEO_EDITOR_PREVIEW_RASTER_PRESETS, value['rasterPreset'])) {
    preferences.rasterPreset = value['rasterPreset'];
  } else if (value['rasterPreset'] !== undefined) invalidFieldCount += 1;
  if (includesValue(VIDEO_EDITOR_PREVIEW_ZOOM_LEVELS, value['zoom']))
    preferences.zoom = value['zoom'];
  else if (value['zoom'] !== undefined) invalidFieldCount += 1;

  return { invalidFieldCount, preferences };
}

export function parseCompleteVideoEditorPreviewPreferences(
  value: unknown
): VideoEditorPreviewPreferences | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !PREFERENCE_KEYS.has(key))) return null;
  if (!includesValue(VIDEO_EDITOR_PREVIEW_MODES, value['mode'])) return null;
  if (!includesValue(VIDEO_EDITOR_PREVIEW_RASTER_PRESETS, value['rasterPreset'])) return null;
  if (!includesValue(VIDEO_EDITOR_PREVIEW_ZOOM_LEVELS, value['zoom'])) return null;
  return { mode: value['mode'], rasterPreset: value['rasterPreset'], zoom: value['zoom'] };
}

// policyStateIds: [] - preference keys are a static parser allowlist, not mutable authority.
const PREFERENCE_KEYS = new Set(['mode', 'rasterPreset', 'zoom']);
