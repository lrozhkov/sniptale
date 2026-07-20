import {
  saveVideoSettings,
  saveVideoUiState,
} from '../../../composition/persistence/capture-settings';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

export async function persistVideoSettings(videoSettings: VideoRecordingSettings): Promise<void> {
  await saveVideoSettings(videoSettings);
}

export async function persistVideoUiState(
  captureMode: CaptureMode,
  selectedPresetId: string | null
): Promise<void> {
  const captureModeToStore =
    captureMode === CaptureMode.VIEWPORT_EMULATION ? CaptureMode.TAB : captureMode;

  await saveVideoUiState({
    captureMode: captureModeToStore,
    viewportPresetId: selectedPresetId,
  });
}
