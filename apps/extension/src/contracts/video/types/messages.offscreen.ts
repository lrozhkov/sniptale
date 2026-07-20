import type { VideoProjectExportSettings } from '../../../features/video/project/types/index';
import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  CaptureMode,
  VideoDisplaySurface,
  VideoRecordingSettings,
  WebcamActualSettings,
  ViewportInfo,
} from '@sniptale/runtime-contracts/video/types/types';
import type { VideoCursorCaptureMode } from '../../../features/video/project/types/index';

export interface OffscreenStartRecordingMessage {
  type: typeof VideoMessageType.OFFSCREEN_START_RECORDING;
  capabilityToken: string;
  streamId: string;
  settings: VideoRecordingSettings;
  tabId?: number;
  viewport?: ViewportInfo;
  recordingId?: string;
  captureMode?: CaptureMode;
  cropRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  targetResolution?: {
    width: number;
    height: number;
  };
  emulatedViewportCssSize?: {
    width: number;
    height: number;
  };
}

export interface OffscreenUpdateViewportCropMessage {
  type: typeof VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP;
  capabilityToken: string;
  targetResolution?: {
    width: number;
    height: number;
  };
  emulatedViewportCssSize?: {
    width: number;
    height: number;
  };
}

export interface OffscreenSetViewportDrawStateMessage {
  type: typeof VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE;
  capabilityToken: string;
  frozen: boolean;
  navigationEpoch: number;
}

export interface OffscreenRecordingStartedMessage {
  type: typeof VideoMessageType.OFFSCREEN_RECORDING_STARTED;
  recordingId: string;
  cursorCaptureMode?: VideoCursorCaptureMode;
  displaySurface?: VideoDisplaySurface;
  webcamSettings?: WebcamActualSettings;
}

export interface OffscreenRecordingStoppedMessage {
  type: typeof VideoMessageType.OFFSCREEN_RECORDING_STOPPED;
  recordingId: string;
  filename?: string;
}

export interface OffscreenRecordingPausedMessage {
  type: typeof VideoMessageType.OFFSCREEN_RECORDING_PAUSED;
  recordingId: string;
}

export interface OffscreenRecordingResumedMessage {
  type: typeof VideoMessageType.OFFSCREEN_RECORDING_RESUMED;
  recordingId: string;
}

export interface OffscreenErrorMessage {
  type: typeof VideoMessageType.OFFSCREEN_ERROR;
  error: string;
  offscreenStartupId?: string;
  phase: 'start' | 'stop' | 'runtime' | 'export';
  recordingId?: string;
}

export interface OffscreenStartProjectExportMessage {
  type: typeof VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT;
  capabilityToken: string;
  input: import('./project-export-input').ProjectExportInputReference;
  jobId: string;
  settings: VideoProjectExportSettings;
}

export interface OffscreenCancelProjectExportMessage {
  type: typeof VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT;
  capabilityToken: string;
  jobId: string;
}
