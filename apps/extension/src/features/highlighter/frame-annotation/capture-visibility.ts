import {
  cloneBorderPresetEffects,
  projectBorderPresetToAppliedSettings,
  type AppliedBorderSettings,
} from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../style/defaults';
import type { FrameAnnotationVisualState } from './model';

export function isFrameHiddenDuringCapture(frame: {
  borderSettings?: AppliedBorderSettings;
}): boolean {
  return frame.borderSettings?.effects?.capture?.hideFrame ?? false;
}

export function setBorderHiddenDuringCapture(
  settings: AppliedBorderSettings,
  hideFrame: boolean
): AppliedBorderSettings {
  const effects = cloneBorderPresetEffects(settings.effects);
  return {
    ...settings,
    effects: { ...effects, capture: { hideFrame } },
  };
}

export function setFrameHiddenDuringCapture(
  frame: FrameAnnotationVisualState,
  hideFrame: boolean
): FrameAnnotationVisualState {
  const borderSettings =
    frame.borderSettings ?? projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
  return {
    ...frame,
    borderSettings: setBorderHiddenDuringCapture(borderSettings, hideFrame),
  };
}
