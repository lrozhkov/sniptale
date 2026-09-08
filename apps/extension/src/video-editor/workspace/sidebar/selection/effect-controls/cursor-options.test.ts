import { describe, expect, it, vi } from 'vitest';
import {
  VideoCursorAnimationPreset,
  VideoCursorVisualPreset,
} from '../../../../../features/video/project/types';
import { getCursorAnimationOptions, getCursorPresetOptions } from './cursor-options';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('cursor-options', () => {
  it('builds cursor preset options with canonical labels', () => {
    expect(getCursorPresetOptions()).toEqual([
      { value: VideoCursorVisualPreset.ARROW, label: 'videoEditor.sidebar.cursorPresetArrow' },
      { value: VideoCursorVisualPreset.DOT, label: 'videoEditor.sidebar.cursorPresetDot' },
      { value: VideoCursorVisualPreset.RING, label: 'videoEditor.sidebar.cursorPresetRing' },
      {
        value: VideoCursorVisualPreset.CROSSHAIR,
        label: 'videoEditor.sidebar.cursorPresetCrosshair',
      },
    ]);
  });

  it('builds cursor animation options with canonical labels', () => {
    expect(getCursorAnimationOptions()).toEqual([
      { value: VideoCursorAnimationPreset.NONE, label: 'videoEditor.sidebar.cursorAnimationNone' },
      {
        value: VideoCursorAnimationPreset.PRESS,
        label: 'videoEditor.sidebar.cursorAnimationPress',
      },
    ]);
  });
});
