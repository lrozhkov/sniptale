import type { VideoMessageType } from '../messages/index';
import type {
  CaptureMode,
  VideoMicrophoneActivity,
  VideoRecordingSettings,
  VideoRecordingStatus,
} from './types';

export interface CountdownCameraOfferMessage {
  type: typeof VideoMessageType.COUNTDOWN_CAMERA_OFFER;
  controlToken: string;
  recordingId: string;
  peerGeneration: number;
  sdp: string;
}

export interface CountdownCameraCloseMessage {
  type: typeof VideoMessageType.COUNTDOWN_CAMERA_CLOSE;
  controlToken: string;
  recordingId: string;
  peerGeneration: number;
}

export interface StartRecordingMessage {
  type: typeof VideoMessageType.START_RECORDING;
  settings: VideoRecordingSettings;
  tabId?: number;
  captureMode?: CaptureMode;
  viewportPresetId?: string | null;
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
  duration?: number;
  microphoneActivity?: VideoMicrophoneActivity;
  recordingId: string;
}

export interface RecordingErrorMessage {
  type: typeof VideoMessageType.RECORDING_ERROR;
  error: string;
}

export type VideoControlMessage =
  | CountdownCameraOfferMessage
  | CountdownCameraCloseMessage
  | StartRecordingMessage
  | CancelRecordingStartMessage
  | StopRecordingMessage
  | PauseRecordingMessage
  | ResumeRecordingMessage
  | UpdateSettingsMessage;
