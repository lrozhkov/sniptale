import {
  patchVideoSettings,
  saveVideoUiState,
} from '../../../composition/persistence/capture-settings';
import type {
  CaptureMode,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

function isSameSettingValue(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

export function createVideoSettingsPatch(
  previous: VideoRecordingSettings,
  next: VideoRecordingSettings
): Partial<VideoRecordingSettings> {
  const patch: Partial<VideoRecordingSettings> = {};
  for (const key of Object.keys(next) as Array<keyof VideoRecordingSettings>) {
    if (!isSameSettingValue(previous[key], next[key])) {
      Object.assign(patch, { [key]: next[key] });
    }
  }
  return patch;
}

export function areVideoSettingsEqual(
  left: VideoRecordingSettings,
  right: VideoRecordingSettings
): boolean {
  return Object.keys(createVideoSettingsPatch(left, right)).length === 0;
}

export function persistVideoSettings(
  patch: Partial<VideoRecordingSettings>
): Promise<VideoRecordingSettings> {
  return patchVideoSettings(patch);
}

export async function persistVideoUiState(
  captureMode: CaptureMode,
  selectedPresetId: string | null
): Promise<void> {
  await saveVideoUiState({
    captureMode,
    viewportPresetId: selectedPresetId,
  });
}
