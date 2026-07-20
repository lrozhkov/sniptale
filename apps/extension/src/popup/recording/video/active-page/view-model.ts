import { translate } from '../../../../platform/i18n';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  describeCaptureSource,
  formatDuration,
  getCaptureModeLabels,
  getViewportPresetLabel,
} from '../copy';
import { useVideoActiveCountdown } from './countdown';

interface VideoActiveViewModel {
  viewportPresetLabel: string | null;
  sourceLabel: string;
  modeLabel: string;
  isPaused: boolean;
  canControl: boolean;
  isBusy: boolean;
  value: string;
}

export function getVideoActiveViewModel(
  recordingState: VideoRecordingRuntimeState,
  countdown: number
): VideoActiveViewModel {
  const viewportPresetLabel = getViewportPresetLabel(recordingState);
  const sourceLabel = describeCaptureSource(
    recordingState.captureSource,
    recordingState.captureMode,
    viewportPresetLabel
  );
  const captureModeLabels = getCaptureModeLabels();
  const modeLabel = recordingState.captureMode
    ? captureModeLabels[recordingState.captureMode]
    : translate('popup.video.activeModeFallback');
  const isPaused = recordingState.status === VideoRecordingStatus.PAUSED;
  const canControl = recordingState.status === VideoRecordingStatus.RECORDING || isPaused;
  const isBusy =
    recordingState.status === VideoRecordingStatus.PREPARING ||
    recordingState.status === VideoRecordingStatus.COUNTDOWN ||
    recordingState.status === VideoRecordingStatus.STOPPING;

  let value = formatDuration(recordingState.duration);
  if (recordingState.status === VideoRecordingStatus.COUNTDOWN) {
    value = String(countdown);
  } else if (recordingState.status === VideoRecordingStatus.PREPARING) {
    value = '...';
  }

  return { viewportPresetLabel, sourceLabel, modeLabel, isPaused, canControl, isBusy, value };
}

export function useVideoActiveViewModel(
  recordingState: VideoRecordingRuntimeState
): VideoActiveViewModel {
  const countdown = useVideoActiveCountdown(recordingState.countdownEndsAt);
  return getVideoActiveViewModel(recordingState, countdown);
}
