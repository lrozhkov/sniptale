import { expect, it } from 'vitest';
import {
  DEFAULT_QUICK_PREVIEW_PREFERENCES,
  QUICK_PREVIEW_FRAME_RATES,
  QUICK_PREVIEW_PAUSED_QUALITIES,
  QUICK_PREVIEW_RASTER_PRESETS,
} from './quick-preferences';

it('preserves native compatibility defaults independently of full-editor defaults', () => {
  expect(DEFAULT_QUICK_PREVIEW_PREFERENCES).toEqual({
    rasterPreset: 'current',
    frameRate: 'current',
    pausedQuality: 'same',
    showFrameRate: false,
  });
  expect(Object.isFrozen(DEFAULT_QUICK_PREVIEW_PREFERENCES)).toBe(true);
  expect(QUICK_PREVIEW_RASTER_PRESETS).toEqual([
    'current',
    '360p',
    '540p',
    '720p',
    '1080p',
    '1440p',
    '2160p',
  ]);
  expect(QUICK_PREVIEW_FRAME_RATES).toEqual(['current', '60', '30', '24', '15']);
  expect(QUICK_PREVIEW_PAUSED_QUALITIES).toEqual(['same', 'detailed']);
});
