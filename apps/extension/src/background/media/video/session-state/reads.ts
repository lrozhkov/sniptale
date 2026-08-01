import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { videoManagerSession } from '../manager/session';

export function getVideoRecordingTabId(): number | null {
  return videoManagerSession.recordingTabId;
}

export function getVideoRecordingId(): string | null {
  return videoManagerSession.currentRecordingId;
}

export function isCurrentVideoRecordingId(
  recordingId: string | null | undefined
): recordingId is string {
  if (typeof recordingId !== 'string') return false;
  return getVideoRecordingId() === recordingId;
}

export function shouldOpenVideoEditorAfterRecording(): boolean {
  return videoManagerSession.openEditorAfterRecording;
}

export function getVideoRecordingCaptureMode(): CaptureMode | null {
  return videoManagerSession.currentCaptureMode;
}

export function getVideoRecordingCountdownSessionId(): string | null {
  return videoManagerSession.currentCountdownSessionId;
}

export function isVideoRecordingPreparationInProgress(): boolean {
  return videoManagerSession.isStarting;
}

export function isVideoRecordingStopInProgress(): boolean {
  return videoManagerSession.isStopping;
}

export function hasActiveVideoRecordingTab(): boolean {
  return getVideoRecordingTabId() !== null;
}

export function hasActiveVideoRecordingSession(): boolean {
  return getVideoRecordingId() !== null || getVideoRecordingCaptureMode() !== null;
}
