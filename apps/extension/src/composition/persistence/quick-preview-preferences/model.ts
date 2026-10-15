import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  DEFAULT_QUICK_PREVIEW_PREFERENCES,
  QUICK_PREVIEW_FRAME_RATES,
  QUICK_PREVIEW_PAUSED_QUALITIES,
  QUICK_PREVIEW_RASTER_PRESETS,
  type QuickPreviewPreferences,
} from '../../../features/video/preview/quick-preferences';

function includes<const Values extends readonly string[]>(
  values: Values,
  value: unknown
): value is Values[number] {
  return typeof value === 'string' && values.some((candidate) => candidate === value);
}

/** Read-only recovery preserves independent valid choices and never copies unknown fields. */
export function parseQuickPreviewPreferences(value: unknown) {
  const preferences: QuickPreviewPreferences = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES };
  if (value === undefined) return { preferences, invalidFieldCount: 0 };
  if (!isPlainRecord(value)) return { preferences, invalidFieldCount: 1 };
  let invalidFieldCount = 0;
  if (includes(QUICK_PREVIEW_RASTER_PRESETS, value['rasterPreset']))
    preferences.rasterPreset = value['rasterPreset'];
  else if (value['rasterPreset'] !== undefined) invalidFieldCount++;
  if (includes(QUICK_PREVIEW_FRAME_RATES, value['frameRate']))
    preferences.frameRate = value['frameRate'];
  else if (value['frameRate'] !== undefined) invalidFieldCount++;
  if (includes(QUICK_PREVIEW_PAUSED_QUALITIES, value['pausedQuality']))
    preferences.pausedQuality = value['pausedQuality'];
  else if (value['pausedQuality'] !== undefined) invalidFieldCount++;
  if (typeof value['showFrameRate'] === 'boolean')
    preferences.showFrameRate = value['showFrameRate'];
  else if (value['showFrameRate'] !== undefined) invalidFieldCount++;
  return { preferences, invalidFieldCount };
}

/** Complete writes reject invalid or surplus fields before acquiring mutation authority. */
export function parseCompleteQuickPreviewPreferences(
  value: unknown
): QuickPreviewPreferences | null {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).some(
      (key) =>
        key !== 'rasterPreset' &&
        key !== 'frameRate' &&
        key !== 'pausedQuality' &&
        key !== 'showFrameRate'
    )
  )
    return null;
  if (
    !includes(QUICK_PREVIEW_RASTER_PRESETS, value['rasterPreset']) ||
    !includes(QUICK_PREVIEW_FRAME_RATES, value['frameRate']) ||
    !includes(QUICK_PREVIEW_PAUSED_QUALITIES, value['pausedQuality']) ||
    typeof value['showFrameRate'] !== 'boolean'
  )
    return null;
  return {
    rasterPreset: value['rasterPreset'],
    frameRate: value['frameRate'],
    pausedQuality: value['pausedQuality'],
    showFrameRate: value['showFrameRate'],
  };
}
