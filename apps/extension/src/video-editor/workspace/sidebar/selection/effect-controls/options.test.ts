import { describe, expect, it, vi } from 'vitest';
import {
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../../../../../features/video/project/types';
import { getActionPresetOptions, getTemporalEasingOptions } from './options';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('effect-options', () => {
  it('builds canonical temporal easing options', () => {
    expect(getTemporalEasingOptions()).toEqual([
      { value: VideoTemporalEasing.LINEAR, label: 'videoEditor.sidebar.temporalEasingLinear' },
      { value: VideoTemporalEasing.EASE_OUT, label: 'videoEditor.sidebar.temporalEasingEaseOut' },
      {
        value: VideoTemporalEasing.EASE_IN_OUT,
        label: 'videoEditor.sidebar.temporalEasingEaseInOut',
      },
      { value: VideoTemporalEasing.INSTANT, label: 'videoEditor.sidebar.temporalEasingInstant' },
    ]);
  });

  it('builds action preset options without unsupported scroll or zoom choices', () => {
    expect(getActionPresetOptions()).toEqual([
      { value: VideoProjectActionPreset.NONE, label: 'videoEditor.sidebar.actionPresetNone' },
      {
        value: VideoProjectActionPreset.CLICK_RIPPLE,
        label: 'videoEditor.sidebar.actionPresetClickRipple',
      },
      {
        value: VideoProjectActionPreset.SPOTLIGHT,
        label: 'videoEditor.sidebar.actionPresetSpotlight',
      },
      {
        value: VideoProjectActionPreset.CLICK_PRESS,
        label: 'videoEditor.sidebar.actionPresetPress',
      },
    ]);
  });
});
