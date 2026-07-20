import type { PopupPage } from '../navigation/actions';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import type { ViewportPreset } from '../../../contracts/settings';

export function resolveSelectedPreset(
  viewportPresets: ViewportPreset[],
  selectedPresetId: string | null
): ViewportPreset | null {
  return viewportPresets.find((preset) => preset.id === selectedPresetId) ?? null;
}

export function isRecordingActive(recordingState: VideoRecordingRuntimeState): boolean {
  return recordingState.status !== 'IDLE';
}

export function shouldShowFooter(
  page: PopupPage,
  recordingState: VideoRecordingRuntimeState
): boolean {
  return page === 'home' && !isRecordingActive(recordingState);
}
