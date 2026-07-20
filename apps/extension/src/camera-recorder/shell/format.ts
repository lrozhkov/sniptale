import { translate } from '../../platform/i18n';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { RuntimeResponseFailure } from './types';

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
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

export function getResponseError(response: RuntimeResponseFailure, fallback: string): string {
  return typeof response.error === 'string' && response.error.length > 0
    ? response.error
    : fallback;
}

export function resolveDeviceName(
  deviceId: string | null | undefined,
  labels: Map<string, string>,
  fallback: string
): string {
  return deviceId ? (labels.get(deviceId) ?? deviceId) : fallback;
}
