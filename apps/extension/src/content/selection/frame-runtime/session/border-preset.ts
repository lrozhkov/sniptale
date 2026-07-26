import type { BorderPreset } from '../../../../features/highlighter/contracts';
import { cloneBorderPreset } from '../../../../features/highlighter/presets/catalog';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';

let currentBorderPreset = cloneBorderPreset(DEFAULT_BORDER_PRESET);
let initialized = false;

export function getFrameSessionBorderPreset(): BorderPreset {
  return cloneBorderPreset(currentBorderPreset);
}

export function setFrameSessionBorderPreset(preset: BorderPreset): void {
  currentBorderPreset = cloneBorderPreset(preset);
  initialized = true;
}

export function initializeFrameSessionBorderPreset(preset: BorderPreset): void {
  if (initialized) {
    return;
  }
  currentBorderPreset = cloneBorderPreset(preset);
  initialized = true;
}

export function resetFrameSessionBorderPreset(): void {
  currentBorderPreset = cloneBorderPreset(DEFAULT_BORDER_PRESET);
  initialized = false;
}
