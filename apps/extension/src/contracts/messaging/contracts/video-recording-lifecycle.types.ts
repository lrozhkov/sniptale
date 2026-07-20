import type { VideoCursorCaptureMode } from '../../../features/video/project/types';
import type {
  VideoDisplaySurface,
  WebcamActualSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

export type RuntimeRecordingDurationUpdatedMessage = {
  type: VideoMessageType.RECORDING_DURATION_UPDATED;
  duration: number;
  recordingId: string;
};

export type RuntimeOffscreenErrorMessage = {
  type: VideoMessageType.OFFSCREEN_ERROR;
  error?: string;
  offscreenStartupId?: string;
  phase?: 'start' | 'stop' | 'runtime' | 'export';
  recordingId?: string;
};

export type RuntimeOffscreenRecordingStoppedMessage = {
  type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED;
  recordingId: string;
  filename?: string;
};

export type RuntimeOffscreenRecordingStartedMessage = {
  type: VideoMessageType.OFFSCREEN_RECORDING_STARTED;
  recordingId: string;
  cursorCaptureMode?: VideoCursorCaptureMode;
  displaySurface?: VideoDisplaySurface;
  webcamSettings?: WebcamActualSettings;
};

export type RuntimeOffscreenRecordingPausedMessage = {
  type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED;
  recordingId: string;
};

export type RuntimeOffscreenRecordingResumedMessage = {
  type: VideoMessageType.OFFSCREEN_RECORDING_RESUMED;
  recordingId: string;
};
