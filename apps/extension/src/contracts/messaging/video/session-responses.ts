import type {
  RuntimeAckResponse,
  RuntimeMessageResponse,
} from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

import type { RecordingStateResponse, RecordingTabResponse } from '../contracts/response-types';

type RuntimeRecordingCommandResult = { result?: string };
type RuntimeRecordingStartResult = RuntimeRecordingCommandResult & {
  cameraLaunchToken?: string;
  controlToken?: string;
  recordingId?: string;
};

export type RuntimeVideoSessionResponseByType = {
  [VideoMessageType.START_RECORDING]: RuntimeMessageResponse<RuntimeRecordingStartResult>;
  [VideoMessageType.CANCEL_RECORDING_START]: RuntimeMessageResponse<RuntimeRecordingCommandResult>;
  [VideoMessageType.STOP_RECORDING]: RuntimeMessageResponse<RuntimeRecordingCommandResult>;
  [VideoMessageType.PAUSE_RECORDING]: RuntimeMessageResponse<RuntimeRecordingCommandResult>;
  [VideoMessageType.RESUME_RECORDING]: RuntimeMessageResponse<RuntimeRecordingCommandResult>;
  [VideoMessageType.UPDATE_SETTINGS]: RuntimeMessageResponse<RuntimeRecordingCommandResult>;
  [VideoMessageType.GET_RECORDING_STATE]: RecordingStateResponse;
  [VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL]: RuntimeMessageResponse<{
    controlToken?: string;
    recordingId?: string;
  }>;
  [VideoMessageType.GET_RECORDING_TAB_ID]: RecordingTabResponse;
  [VideoMessageType.RECORDING_STATE_SYNC]: RuntimeAckResponse;
  [VideoMessageType.RECORDING_DURATION_UPDATED]: RuntimeAckResponse;
  [VideoMessageType.RECORDING_START_FAILED]: RuntimeAckResponse;
  [VideoMessageType.COUNTDOWN_COMPLETE]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_READY]: RuntimeMessageResponse<Record<string, never>>;
  [VideoMessageType.OFFSCREEN_START_RECORDING]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_STOP_RECORDING]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_PAUSE_RECORDING]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_RESUME_RECORDING]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_UPDATE_SETTINGS]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_RECORDING_STARTED]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_RECORDING_STOPPED]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_RECORDING_PAUSED]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_RECORDING_RESUMED]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_ERROR]: RuntimeAckResponse;
  [VideoMessageType.GET_DESKTOP_MEDIA]: RuntimeAckResponse;
  [VideoMessageType.DISPOSE_DESKTOP_MEDIA]: RuntimeAckResponse;
  [VideoMessageType.REGION_SELECTED]: RuntimeAckResponse;
  [VideoMessageType.REGION_SELECTION_CANCELLED]: RuntimeAckResponse;
  [VideoMessageType.DESKTOP_MEDIA_OBTAINED]: RuntimeAckResponse;
  [VideoMessageType.DESKTOP_MEDIA_CANCELLED]: RuntimeAckResponse;
  [VideoMessageType.DESKTOP_MEDIA_FAILED]: RuntimeAckResponse;
  [VideoMessageType.CAPTURE_SOURCE_OBTAINED]: RuntimeMessageResponse<Record<string, never>>;
};
