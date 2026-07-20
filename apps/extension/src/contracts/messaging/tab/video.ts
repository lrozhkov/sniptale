import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type {
  RegionCaptureControlMessageType,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';
import type { RuntimeRequestByType } from '../contracts/runtime-message/index';
import type {
  RecordingTelemetryResponse,
  ViewportCoordsResponse,
} from '../contracts/response-types';
import type {
  CheckRegionCaptureSupportMessage,
  RegionCaptureSupportResponse,
  StartRegionCaptureMessage,
  StopRegionCaptureMessage,
} from '../contracts/types';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

export type TabVideoRequestByType = {
  [VideoMessageType.ENABLE_ANNOTATIONS]: {
    type: typeof VideoMessageType.ENABLE_ANNOTATIONS;
    settings: VideoRecordingSettings;
    recordingId?: string;
  };
  [VideoMessageType.DISABLE_ANNOTATIONS]: {
    type: typeof VideoMessageType.DISABLE_ANNOTATIONS;
  };
  [VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE]: {
    type: typeof VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE;
    recordingId: string;
    offsetSeconds?: number;
  };
  [VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE]: {
    type: typeof VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE;
  };
  [VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE]: {
    type: typeof VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE;
  };
  [VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE]: {
    type: typeof VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE;
  };
  [VideoMessageType.SHOW_COUNTDOWN]: {
    type: typeof VideoMessageType.SHOW_COUNTDOWN;
    seconds: number;
    sessionId?: string;
  };
  [VideoMessageType.HIDE_COUNTDOWN]: { type: typeof VideoMessageType.HIDE_COUNTDOWN };
  [VideoMessageType.GET_VIEWPORT_COORDS]: { type: typeof VideoMessageType.GET_VIEWPORT_COORDS };
  [VideoMessageType.SHOW_REGION_SELECTOR]: {
    type: typeof VideoMessageType.SHOW_REGION_SELECTOR;
    regionSelectionCapabilityToken: string;
    regionSelectionRequestGeneration: string;
    regionSelectionRequestId: string;
  };
  [VideoMessageType.HIDE_REGION_SELECTOR]: { type: typeof VideoMessageType.HIDE_REGION_SELECTOR };
  [VideoMessageType.REGION_SELECTED]: RuntimeRequestByType[typeof VideoMessageType.REGION_SELECTED];
  [VideoMessageType.REGION_SELECTION_CANCELLED]: {
    type: typeof VideoMessageType.REGION_SELECTION_CANCELLED;
    regionSelectionCapabilityToken: string;
    regionSelectionRequestGeneration: string;
    regionSelectionRequestId: string;
  };
  [VideoMessageType.SHOW_RECORDING_OVERLAY]: {
    type: typeof VideoMessageType.SHOW_RECORDING_OVERLAY;
    region: RuntimeRequestByType[typeof VideoMessageType.REGION_SELECTED]['region'];
  };
  [VideoMessageType.HIDE_RECORDING_OVERLAY]: {
    type: typeof VideoMessageType.HIDE_RECORDING_OVERLAY;
  };
  [VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER]: {
    type: typeof VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER;
    recordingId?: string;
  };
  [VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER]: {
    type: typeof VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER;
  };
  [RegionCaptureControlMessageType.START]: StartRegionCaptureMessage;
  [RegionCaptureControlMessageType.STOP]: StopRegionCaptureMessage;
  [RegionCaptureControlMessageType.CHECK_SUPPORT]: CheckRegionCaptureSupportMessage;
};

export type TabVideoResponseByType = {
  [VideoMessageType.ENABLE_ANNOTATIONS]: ViewportCoordsResponse;
  [VideoMessageType.DISABLE_ANNOTATIONS]: RecordingTelemetryResponse;
  [VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE]: ViewportCoordsResponse;
  [VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE]: RecordingTelemetryResponse;
  [VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE]: RuntimeMessageResponse<
    Record<string, never>
  >;
  [VideoMessageType.SHOW_COUNTDOWN]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.HIDE_COUNTDOWN]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.GET_VIEWPORT_COORDS]: ViewportCoordsResponse;
  [VideoMessageType.SHOW_REGION_SELECTOR]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.HIDE_REGION_SELECTOR]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.REGION_SELECTED]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.REGION_SELECTION_CANCELLED]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.SHOW_RECORDING_OVERLAY]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.HIDE_RECORDING_OVERLAY]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER]: RuntimeMessageResponse<Record<string, never>>;
  [RegionCaptureControlMessageType.START]: RuntimeMessageResponse<Record<string, never>>;
  [RegionCaptureControlMessageType.STOP]: RuntimeMessageResponse<Record<string, never>>;
  [RegionCaptureControlMessageType.CHECK_SUPPORT]: RegionCaptureSupportResponse;
};
