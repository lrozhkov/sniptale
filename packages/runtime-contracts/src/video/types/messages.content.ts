import type { VideoMessageType } from '../messages/index';
import type { CaptureMode, VideoRecordingSettings } from './types';

export interface EnableAnnotationsMessage {
  type: typeof VideoMessageType.ENABLE_ANNOTATIONS;
  settings: VideoRecordingSettings;
  recordingId?: string;
}

export interface DisableAnnotationsMessage {
  type: typeof VideoMessageType.DISABLE_ANNOTATIONS;
}

export interface EnableControlledCursorCaptureMessage {
  type: typeof VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE;
  recordingId: string;
  offsetSeconds?: number;
}

export interface DisableControlledCursorCaptureMessage {
  type: typeof VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE;
}

export interface PauseControlledCursorCaptureMessage {
  type: typeof VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE;
}

export interface ResumeControlledCursorCaptureMessage {
  type: typeof VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE;
}

export interface ShowCountdownMessage {
  type: typeof VideoMessageType.SHOW_COUNTDOWN;
  seconds: number;
  sessionId?: string;
}

export interface HideCountdownMessage {
  type: typeof VideoMessageType.HIDE_COUNTDOWN;
}

export interface GetViewportCoordsMessage {
  type: typeof VideoMessageType.GET_VIEWPORT_COORDS;
}

export interface GetRecordingStateMessage {
  type: typeof VideoMessageType.GET_RECORDING_STATE;
}

export interface RegisterCameraRecorderControlMessage {
  type: typeof VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL;
  cameraLaunchToken: string;
  recordingId: string;
}

export interface GetRecordingTabIdMessage {
  type: typeof VideoMessageType.GET_RECORDING_TAB_ID;
}

export interface ShowRegionSelectorMessage {
  type: typeof VideoMessageType.SHOW_REGION_SELECTOR;
  regionSelectionCapabilityToken: string;
  regionSelectionRequestGeneration: string;
  regionSelectionRequestId: string;
}

export interface HideRegionSelectorMessage {
  type: typeof VideoMessageType.HIDE_REGION_SELECTOR;
}

export interface RegionSelectedMessage {
  type: typeof VideoMessageType.REGION_SELECTED;
  regionSelectionCapabilityToken: string;
  regionSelectionRequestGeneration: string;
  regionSelectionRequestId: string;
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface RegionSelectionCancelledMessage {
  type: typeof VideoMessageType.REGION_SELECTION_CANCELLED;
  regionSelectionCapabilityToken: string;
  regionSelectionRequestGeneration: string;
  regionSelectionRequestId: string;
}

export interface ShowRecordingOverlayMessage {
  type: typeof VideoMessageType.SHOW_RECORDING_OVERLAY;
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface HideRecordingOverlayMessage {
  type: typeof VideoMessageType.HIDE_RECORDING_OVERLAY;
}

export interface GetDesktopMediaMessage {
  type: typeof VideoMessageType.GET_DESKTOP_MEDIA;
  capabilityToken: string;
  captureMode: CaptureMode;
  desktopMediaRequestGeneration: string;
  desktopMediaRequestId: string;
  controlledCursorCaptureEnabled?: boolean;
  desktopLabel?: string;
  desktopStreamId?: string;
  sourceIndex?: number;
  sourceCount?: number;
}

export interface DisposeDesktopMediaMessage {
  type: typeof VideoMessageType.DISPOSE_DESKTOP_MEDIA;
  capabilityToken: string;
}

export interface DesktopMediaObtainedMessage {
  type: typeof VideoMessageType.DESKTOP_MEDIA_OBTAINED;
  desktopMediaRequestGeneration: string;
  desktopMediaRequestId: string;
  label: string;
  sourceIndex?: number;
  sourceCount?: number;
}

export interface DesktopMediaCancelledMessage {
  type: typeof VideoMessageType.DESKTOP_MEDIA_CANCELLED;
  desktopMediaRequestGeneration: string;
  desktopMediaRequestId: string;
  sourceIndex?: number;
  sourceCount?: number;
}

export interface DesktopMediaFailedMessage {
  type: typeof VideoMessageType.DESKTOP_MEDIA_FAILED;
  desktopMediaRequestGeneration: string;
  desktopMediaRequestId: string;
  error: string;
  phase: 'desktop-stream-acquire' | 'display-media-acquire';
  sourceIndex?: number;
  sourceCount?: number;
}

export type ContentVideoMessage =
  | EnableAnnotationsMessage
  | DisableAnnotationsMessage
  | EnableControlledCursorCaptureMessage
  | DisableControlledCursorCaptureMessage
  | PauseControlledCursorCaptureMessage
  | ResumeControlledCursorCaptureMessage
  | ShowCountdownMessage
  | HideCountdownMessage
  | GetViewportCoordsMessage
  | ShowRegionSelectorMessage
  | HideRegionSelectorMessage
  | RegionSelectedMessage
  | RegionSelectionCancelledMessage
  | ShowRecordingOverlayMessage
  | HideRecordingOverlayMessage
  | GetRecordingStateMessage
  | GetRecordingTabIdMessage
  | GetDesktopMediaMessage
  | DisposeDesktopMediaMessage;
