import { translate } from '../../../../../platform/i18n';
import type { GlassSelectOption } from '../../../../../ui/glass-select';
import {
  VideoCursorAnimationPreset,
  VideoCursorVisualPreset,
} from '../../../../../features/video/project/types';

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
      value: VideoCursorAnimationPreset.PRESS,
      label: translate('videoEditor.sidebar.cursorAnimationPress'),
    },
  ];
  return options;
}
