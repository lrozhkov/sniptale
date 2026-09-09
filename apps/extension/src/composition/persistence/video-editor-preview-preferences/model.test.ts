import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES,
  parseVideoEditorPreviewPreferences,
} from './model';

describe('video editor preview preference parsing', () => {
  it('accepts the complete validated preference contract', () => {
    expect(
      parseVideoEditorPreviewPreferences({
        frameRate: 'project',
        mode: 'cache',
        rasterPreset: '2160p',
        zoom: '100%',
      })
    ).toEqual({
      invalidFieldCount: 0,
      preferences: { frameRate: 'project', mode: 'cache', rasterPreset: '2160p', zoom: '100%' },
    });
  });

  it('drops invalid fields without repairing the stored value', () => {
    expect(
      parseVideoEditorPreviewPreferences({ mode: 'invalid', rasterPreset: '720p', zoom: 75 })
    ).toEqual({
      invalidFieldCount: 2,
      preferences: {
        ...DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES,
        rasterPreset: '720p',
      },
    });
  });

  it('uses defaults for a malformed root', () => {
    expect(parseVideoEditorPreviewPreferences('cache')).toEqual({
      invalidFieldCount: 1,
      preferences: DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES,
    });
  });
});

it('accepts FPS limits and rejects unsupported values without changing project settings', () => {
  expect(parseVideoEditorPreviewPreferences({ frameRate: '15' }).preferences.frameRate).toBe('15');
  const invalid = parseVideoEditorPreviewPreferences({ frameRate: 999 });
  expect(invalid.invalidFieldCount).toBe(1);
  expect(invalid.preferences.frameRate).toBe('project');
});
