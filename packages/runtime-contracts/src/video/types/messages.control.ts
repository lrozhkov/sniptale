import type { VideoMessageType } from '../messages/index';
import type {
  CaptureMode,
  VideoRecordingSettings,
  VideoRecordingStatus,
  VideoViewportPresetSelection,
} from './types';

export interface StartRecordingMessage {
  type: typeof VideoMessageType.START_RECORDING;
  settings: VideoRecordingSettings;
  tabId?: number;
  captureMode?: CaptureMode;
  viewportPreset?: VideoViewportPresetSelection;
}

export interface StopRecordingMessage {
  type: typeof VideoMessageType.STOP_RECORDING;
  controlToken: string;
  discard?: boolean;
  recordingId: string;
}

export interface CancelRecordingStartMessage {
  type: typeof VideoMessageType.CANCEL_RECORDING_START;
  controlToken: string;
  recordingId: string;
}

export interface PauseRecordingMessage {
  type: typeof VideoMessageType.PAUSE_RECORDING;
  controlToken: string;
  recordingId: string;
}

export interface ResumeRecordingMessage {
  type: typeof VideoMessageType.RESUME_RECORDING;
  controlToken: string;
  recordingId: string;
}

export interface UpdateSettingsMessage {
  type: typeof VideoMessageType.UPDATE_SETTINGS;
  controlToken: string;
  recordingId: string;
  settings: Partial<VideoRecordingSettings>;
}

export interface RecordingStatusChangedMessage {
  type: typeof VideoMessageType.RECORDING_STATUS_CHANGED;
  status: VideoRecordingStatus;
}

export interface RecordingDurationUpdatedMessage {
  type: typeof VideoMessageType.RECORDING_DURATION_UPDATED;
  duration: number;
  recordingId: string;
}

export interface RecordingErrorMessage {
  type: typeof VideoMessageType.RECORDING_ERROR;
  error: string;
}

export type VideoControlMessage =
  | StartRecordingMessage
  | CancelRecordingStartMessage
  | StopRecordingMessage
  | PauseRecordingMessage
  | ResumeRecordingMessage
  | UpdateSettingsMessage;
