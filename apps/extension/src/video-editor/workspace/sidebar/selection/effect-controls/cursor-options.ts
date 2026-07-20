import { translate } from '../../../../../platform/i18n';
import type { GlassSelectOption } from '../../../../../ui/glass-select';
import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
} from '../../../../../features/video/project/types';

export function getCursorCaptureModeOptions() {
  const options: GlassSelectOption<VideoCursorCaptureMode>[] = [
    {
      value: VideoCursorCaptureMode.SEPARATE,
      label: translate('videoEditor.sidebar.cursorCaptureModeSeparate'),
    },
    {
      value: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
      label: translate('videoEditor.sidebar.cursorCaptureModeFallback'),
    },
  ];
  return options;
}

export function getCursorPresetOptions() {
  const options: GlassSelectOption<VideoCursorVisualPreset>[] = [
    {
      value: VideoCursorVisualPreset.ARROW,
      label: translate('videoEditor.sidebar.cursorPresetArrow'),
    },
    {
      value: VideoCursorVisualPreset.DOT,
      label: translate('videoEditor.sidebar.cursorPresetDot'),
    },
    {
      value: VideoCursorVisualPreset.RING,
      label: translate('videoEditor.sidebar.cursorPresetRing'),
    },
    {
      value: VideoCursorVisualPreset.CROSSHAIR,
      label: translate('videoEditor.sidebar.cursorPresetCrosshair'),
    },
  ];
  return options;
}

export function getCursorAnimationOptions() {
  const options: GlassSelectOption<VideoCursorAnimationPreset>[] = [
    {
      value: VideoCursorAnimationPreset.NONE,
      label: translate('videoEditor.sidebar.cursorAnimationNone'),
    },
    {
      value: VideoCursorAnimationPreset.PULSE,
      label: translate('videoEditor.sidebar.cursorAnimationPulse'),
    },
    {
      value: VideoCursorAnimationPreset.FLOAT,
      label: translate('videoEditor.sidebar.cursorAnimationFloat'),
    },
    {
      value: VideoCursorAnimationPreset.BREATHE,
      label: translate('videoEditor.sidebar.cursorAnimationBreathe'),
    },
  ];
  return options;
}
