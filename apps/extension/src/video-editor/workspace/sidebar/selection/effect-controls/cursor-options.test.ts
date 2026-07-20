import { describe, expect, it, vi } from 'vitest';
import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
} from '../../../../../features/video/project/types';
import {
  getCursorAnimationOptions,
  getCursorCaptureModeOptions,
  getCursorPresetOptions,
} from './cursor-options';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

describe('cursor-options', () => {
  it('builds cursor capture mode options with canonical labels', () => {
    expect(getCursorCaptureModeOptions()).toEqual([
      {
        value: VideoCursorCaptureMode.SEPARATE,
        label: 'videoEditor.sidebar.cursorCaptureModeSeparate',
      },
      {
        value: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
        label: 'videoEditor.sidebar.cursorCaptureModeFallback',
      },
    ]);
  });

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
        value: VideoCursorAnimationPreset.PULSE,
        label: 'videoEditor.sidebar.cursorAnimationPulse',
      },
      {
        value: VideoCursorAnimationPreset.FLOAT,
        label: 'videoEditor.sidebar.cursorAnimationFloat',
      },
      {
        value: VideoCursorAnimationPreset.BREATHE,
        label: 'videoEditor.sidebar.cursorAnimationBreathe',
      },
    ]);
  });
});
