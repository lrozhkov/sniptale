import type {
  AppliedBorderSettings,
  BorderPreset,
} from '../../../../features/highlighter/contracts';
import {
  cloneAppliedBorderSettings,
  normalizeAppliedBorderSettings,
  projectBorderPresetToAppliedSettings,
} from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';

let currentBorderPreset = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
let initialized = false;

export function getFrameSessionBorderPreset(): AppliedBorderSettings {
  return cloneAppliedBorderSettings(currentBorderPreset);
}

export function setFrameSessionBorderPreset(settings: AppliedBorderSettings | BorderPreset): void {
  currentBorderPreset = normalizeAppliedBorderSettings(settings);
  initialized = true;
}

export function initializeFrameSessionBorderPreset(
  settings: AppliedBorderSettings | BorderPreset
): void {
  if (initialized) {
    return;
  }
  currentBorderPreset = normalizeAppliedBorderSettings(settings);
  initialized = true;
}

export function resetFrameSessionBorderPreset(): void {
  currentBorderPreset = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
  initialized = false;
}
