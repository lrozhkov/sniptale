import { translate } from '../../../../platform/i18n';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

export function getVideoActiveIndicatorClassName(
  status: VideoRecordingRuntimeState['status']
): string {
  return status === VideoRecordingStatus.RECORDING
    ? [
        'bg-[var(--sniptale-color-danger)]',
        'shadow-[0_0_6px_color-mix(in_srgb,var(--sniptale-color-danger)_34%,transparent)]',
      ].join(' ')
    : 'bg-[var(--sniptale-color-text-dim)]';
}

export function getVideoActiveValueClassName(status: VideoRecordingRuntimeState['status']): string {
  return status === VideoRecordingStatus.RECORDING
    ? [
        'text-[var(--sniptale-color-danger)]',
        '[text-shadow:0_0_12px_color-mix(in_srgb,var(--sniptale-color-danger)_20%,transparent)]',
      ].join(' ')
    : 'text-[var(--sniptale-color-text-primary-strong)]';
}

export function getVideoActivePauseResumeLabel(isPaused: boolean): string {
  return isPaused ? translate('popup.video.resumeButton') : translate('popup.video.pauseButton');
}

export function getVideoActiveIdleLabel(isBusy: boolean): string {
  return isBusy ? translate('popup.video.waitingState') : translate('popup.video.readyState');
}

export function getVideoActiveStopLabel(params: {
  canControl: boolean;
  recordingState: VideoRecordingRuntimeState;
}): string {
  if (params.recordingState.status === VideoRecordingStatus.STOPPING) {
    return translate('popup.video.stoppingState');
  }

  return params.canControl
    ? translate('popup.video.stopButton')
    : translate('popup.video.cancelButton');
}
