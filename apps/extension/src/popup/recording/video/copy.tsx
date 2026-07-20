import { translate } from '../../../platform/i18n';
import {
  CaptureMode,
  type CaptureSource,
  type VideoRecordingRuntimeState,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';

export const IDLE_RECORDING_STATE: VideoRecordingRuntimeState = {
  status: VideoRecordingStatus.IDLE,
  duration: 0,
  countdownEndsAt: null,
  captureMode: null,
  captureSource: null,
  viewportPreset: null,
  liveMedia: null,
  error: null,
};

export function getCaptureModeLabels(): Record<CaptureMode, string> {
  return {
    [CaptureMode.TAB]: translate('popup.labels.captureModeTab'),
    [CaptureMode.TAB_CROP]: translate('popup.labels.captureModeArea'),
    [CaptureMode.VIEWPORT_EMULATION]: translate('popup.labels.captureModePreset'),
    [CaptureMode.CAMERA]: translate('popup.video.modeCameraLabel'),
    [CaptureMode.SCREEN]: translate('popup.labels.captureModeScreen'),
  };
}

export function supportsControlledCursorCapture(captureMode: CaptureMode): boolean {
  switch (captureMode) {
    case CaptureMode.SCREEN:
    case CaptureMode.TAB:
    case CaptureMode.TAB_CROP:
    case CaptureMode.VIEWPORT_EMULATION:
    case CaptureMode.CAMERA:
      return false;
  }
}

export function supportsCursorTrackTelemetry(captureMode: CaptureMode): boolean {
  switch (captureMode) {
    case CaptureMode.TAB:
    case CaptureMode.TAB_CROP:
    case CaptureMode.VIEWPORT_EMULATION:
      return true;
    case CaptureMode.CAMERA:
    case CaptureMode.SCREEN:
      return false;
  }
}

export function getControlledCursorDescription(captureMode: CaptureMode): string {
  return supportsControlledCursorCapture(captureMode)
    ? translate('popup.video.controlledCursorDescriptionScreen')
    : translate('popup.video.controlledCursorDescriptionEmbedded');
}

export function getRecordingStatusLabel(status: VideoRecordingStatus): string {
  switch (status) {
    case VideoRecordingStatus.IDLE:
      return translate('popup.labels.statusReady');
    case VideoRecordingStatus.PREPARING:
      return translate('popup.labels.statusPreparing');
    case VideoRecordingStatus.COUNTDOWN:
      return translate('popup.labels.statusCountdown');
    case VideoRecordingStatus.RECORDING:
      return translate('popup.labels.statusRecording');
    case VideoRecordingStatus.PAUSED:
      return translate('popup.labels.statusPaused');
    case VideoRecordingStatus.STOPPING:
      return translate('popup.labels.statusSaving');
  }
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainder
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

export function describeCaptureSource(
  captureSource: CaptureSource | null,
  captureMode: CaptureMode | null,
  viewportPresetLabel: string | null
): string {
  const captureModeLabels = getCaptureModeLabels();
  if (captureSource) {
    switch (captureSource.mode) {
      case CaptureMode.TAB:
        return captureSource.tabTitle || translate('popup.labels.sourceActiveTab');
      case CaptureMode.TAB_CROP:
        if (captureSource.cropRegion) {
          return [
            captureSource.tabTitle || translate('popup.labels.sourceTabArea'),
            `${captureSource.cropRegion.width}×${captureSource.cropRegion.height}`,
          ].join(' • ');
        }
        return captureSource.tabTitle || translate('popup.labels.sourceTabArea');
      case CaptureMode.SCREEN:
        return captureSource.screenName || translate('popup.labels.sourceScreen');
      case CaptureMode.CAMERA:
        return translate('popup.video.modeCameraLabel');
      case CaptureMode.VIEWPORT_EMULATION:
        return viewportPresetLabel
          ? `${captureSource.tabTitle || translate('popup.labels.captureModeTab')} • ${viewportPresetLabel}`
          : captureSource.tabTitle || translate('popup.labels.sourceViewportPreset');
    }
  }

  if (captureMode === CaptureMode.VIEWPORT_EMULATION && viewportPresetLabel) {
    return `${translate('popup.labels.sourceViewportPrefix')} ${viewportPresetLabel}`;
  }

  if (captureMode) {
    return captureModeLabels[captureMode];
  }

  return translate('popup.labels.sourcePending');
}

export function getViewportPresetLabel(state: VideoRecordingRuntimeState): string | null {
  if (!state.viewportPreset) {
    return null;
  }

  const { label, width, height } = state.viewportPreset;
  return label ? `${label} ${width}×${height}` : `${width}×${height}`;
}
