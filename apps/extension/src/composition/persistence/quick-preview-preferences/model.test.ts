import { expect, it } from 'vitest';
import {
  DEFAULT_QUICK_PREVIEW_PREFERENCES,
  QUICK_PREVIEW_FRAME_RATES,
  QUICK_PREVIEW_PAUSED_QUALITIES,
  QUICK_PREVIEW_RASTER_PRESETS,
} from '../../../features/video/preview/quick-preferences';
import { parseCompleteQuickPreviewPreferences, parseQuickPreviewPreferences } from './model';

it('admits every finite choice and materializes independent preference snapshots', () => {
  for (const rasterPreset of QUICK_PREVIEW_RASTER_PRESETS)
    for (const frameRate of QUICK_PREVIEW_FRAME_RATES)
      for (const pausedQuality of QUICK_PREVIEW_PAUSED_QUALITIES)
        for (const showFrameRate of [false, true]) {
          const input = { rasterPreset, frameRate, pausedQuality, showFrameRate };
          expect(parseCompleteQuickPreviewPreferences(input)).toEqual(input);
          expect(parseQuickPreviewPreferences(input)).toEqual({
            preferences: input,
            invalidFieldCount: 0,
          });
          expect(parseCompleteQuickPreviewPreferences(input)).not.toBe(input);
        }
});

it('defaults missing input without sharing mutable defaults', () => {
  const first = parseQuickPreviewPreferences(undefined);
  expect(first).toEqual({ preferences: DEFAULT_QUICK_PREVIEW_PREFERENCES, invalidFieldCount: 0 });
  first.preferences.frameRate = '15';
  expect(parseQuickPreviewPreferences(undefined).preferences.frameRate).toBe('current');
});

it.each([null, [], false, 60, '720p'].map((value) => ({ value })))(
  'recovers non-record $value without admitting it for writes',
  ({ value }) => {
    expect(parseQuickPreviewPreferences(value)).toEqual({
      preferences: DEFAULT_QUICK_PREVIEW_PREFERENCES,
      invalidFieldCount: 1,
    });
    expect(parseCompleteQuickPreviewPreferences(value)).toBeNull();
  }
);

it('keeps independent valid fields, ignores unknown content and does not coerce invalid values', () => {
  const result = parseQuickPreviewPreferences({
    rasterPreset: '1080p',
    frameRate: 60,
    pausedQuality: 'cached',
    showFrameRate: 'true',
    content: 'private',
  });
  expect(result).toEqual({
    preferences: { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, rasterPreset: '1080p' },
    invalidFieldCount: 3,
  });
  expect(parseQuickPreviewPreferences({ frameRate: '24' }).preferences.frameRate).toBe('24');
  expect(parseCompleteQuickPreviewPreferences({ frameRate: '24' })).toBeNull();
  expect(
    parseCompleteQuickPreviewPreferences({
      ...DEFAULT_QUICK_PREVIEW_PREFERENCES,
      content: 'private',
    })
  ).toBeNull();
  expect(
    parseCompleteQuickPreviewPreferences({
      ...DEFAULT_QUICK_PREVIEW_PREFERENCES,
      frameRate: 'project',
    })
  ).toBeNull();
});
