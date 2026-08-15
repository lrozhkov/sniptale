import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  RuntimeAreaSelectedMessage,
  RuntimeDesktopMediaObtainedMessage,
  RuntimeDisposeDesktopMediaMessage,
  RuntimeGetDesktopMediaMessage,
  RuntimeOffscreenErrorMessage,
  RuntimeOffscreenRecordingPausedMessage,
  RuntimeOffscreenRecordingResumedMessage,
  RuntimeOffscreenRecordingStartedMessage,
  RuntimeOffscreenRecordingStoppedMessage,
  RuntimeOffscreenSourceReadyMessage,
  RuntimeOffscreenBeginRecordingMessage,
  RuntimeOffscreenStartRecordingMessage,
  RuntimeOffscreenStopRecordingMessage,
  RuntimeOffscreenUpdateSettingsMessage,
  RuntimeRecordingDurationUpdatedMessage,
  RuntimeRecordingStartFailedMessage,
  RuntimeRecordingStateSyncMessage,
} from '../contracts/types';
import type {
  CaptureSource,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type {
  ReleaseVideoRecordingSurfaceMessage,
  VideoRecordingSurfaceCommandMessage,
  VideoRecordingCameraOfferMessage,
  VideoRecordingCameraCloseMessage,
} from '@sniptale/runtime-contracts/video/types/messages.surface';

export type { RuntimeVideoSessionResponseByType } from './session-responses';

export type RuntimeVideoSessionRequestByType = {
  [VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE]: ReleaseVideoRecordingSurfaceMessage;
  [VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND]: VideoRecordingSurfaceCommandMessage;
  [VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER]: VideoRecordingCameraOfferMessage;
  [VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE]: VideoRecordingCameraCloseMessage;
  [VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER]: {
    type: typeof VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER;
    capabilityToken: string;
    peerId: string;
    sdp: string;
    settings: VideoRecordingSettings;
  };
  [VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE]: {
    type: typeof VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE;
    capabilityToken: string;
    peerId: string;
  };
  [VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH]: {
    type: typeof VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH;
    capabilityToken: string;
    deviceId: string | null;
    peerId: string;
  };
  [VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES]: {
    type: typeof VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES;
    capabilityToken: string;
    deviceKind: 'audioinput' | 'videoinput';
  };
  [VideoMessageType.START_RECORDING]: {
    type: typeof VideoMessageType.START_RECORDING;
    settings: VideoRecordingSettings;
    tabId?: number;
    captureMode?: string;
    viewportPresetId?: string | null;
  };
  [VideoMessageType.CANCEL_RECORDING_START]: {
    type: typeof VideoMessageType.CANCEL_RECORDING_START;
    controlToken: string;
    recordingId: string;
  };
  [VideoMessageType.STOP_RECORDING]: {
    type: typeof VideoMessageType.STOP_RECORDING;
    controlToken: string;
    discard?: boolean;
    recordingId: string;
  };
  [VideoMessageType.PAUSE_RECORDING]: {
    type: typeof VideoMessageType.PAUSE_RECORDING;
    controlToken: string;
    recordingId: string;
  };
  [VideoMessageType.RESUME_RECORDING]: {
    type: typeof VideoMessageType.RESUME_RECORDING;
    controlToken: string;
    recordingId: string;
  };
  [VideoMessageType.UPDATE_SETTINGS]: {
    type: typeof VideoMessageType.UPDATE_SETTINGS;
    controlToken: string;
    recordingId: string;
    settings: Partial<VideoRecordingSettings>;
  };
  [VideoMessageType.GET_RECORDING_STATE]: { type: typeof VideoMessageType.GET_RECORDING_STATE };
  [VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT]: {
    type: typeof VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT;
    recordingId: string;
  };
  [VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL]: {
    type: typeof VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL;
    cameraRegistrationToken?: string;
    recordingId?: string;
  };
  [VideoMessageType.GET_RECORDING_TAB_ID]: {
    type: typeof VideoMessageType.GET_RECORDING_TAB_ID;
  };
  [VideoMessageType.RECORDING_STATE_SYNC]: RuntimeRecordingStateSyncMessage;
  [VideoMessageType.RECORDING_DURATION_UPDATED]: RuntimeRecordingDurationUpdatedMessage;
  [VideoMessageType.RECORDING_START_FAILED]: RuntimeRecordingStartFailedMessage;
  [VideoMessageType.COUNTDOWN_COMPLETE]: {
    type: typeof VideoMessageType.COUNTDOWN_COMPLETE;
    sessionId: string;
  };
  [VideoMessageType.OFFSCREEN_READY]: {
    type: typeof VideoMessageType.OFFSCREEN_READY;
    offscreenStartupId: string;
  };
  [VideoMessageType.OFFSCREEN_START_RECORDING]: RuntimeOffscreenStartRecordingMessage;
  [VideoMessageType.OFFSCREEN_SOURCE_READY]: RuntimeOffscreenSourceReadyMessage;
  [VideoMessageType.OFFSCREEN_BEGIN_RECORDING]: RuntimeOffscreenBeginRecordingMessage;
  [VideoMessageType.OFFSCREEN_STOP_RECORDING]: RuntimeOffscreenStopRecordingMessage;
  [VideoMessageType.OFFSCREEN_PAUSE_RECORDING]: {
    type: typeof VideoMessageType.OFFSCREEN_PAUSE_RECORDING;
    capabilityToken: string;
    recordingId: string;
    generation: number;
    streamInstanceId: string;
  };
  [VideoMessageType.OFFSCREEN_RESUME_RECORDING]: {
    type: typeof VideoMessageType.OFFSCREEN_RESUME_RECORDING;
    capabilityToken: string;
    recordingId: string;
    generation: number;
    streamInstanceId: string;
  };
  [VideoMessageType.OFFSCREEN_UPDATE_SETTINGS]: RuntimeOffscreenUpdateSettingsMessage;
  [VideoMessageType.OFFSCREEN_RECORDING_STARTED]: RuntimeOffscreenRecordingStartedMessage;
  [VideoMessageType.OFFSCREEN_RECORDING_STOPPED]: RuntimeOffscreenRecordingStoppedMessage;
  [VideoMessageType.OFFSCREEN_RECORDING_PAUSED]: RuntimeOffscreenRecordingPausedMessage;
  [VideoMessageType.OFFSCREEN_RECORDING_RESUMED]: RuntimeOffscreenRecordingResumedMessage;
  [VideoMessageType.OFFSCREEN_ERROR]: RuntimeOffscreenErrorMessage;
  [VideoMessageType.GET_DESKTOP_MEDIA]: RuntimeGetDesktopMediaMessage;
  [VideoMessageType.DISPOSE_DESKTOP_MEDIA]: RuntimeDisposeDesktopMediaMessage;
  [VideoMessageType.REGION_SELECTED]: {
    type: typeof VideoMessageType.REGION_SELECTED;
    regionSelectionCapabilityToken: string;
    regionSelectionRequestGeneration: string;
    regionSelectionRequestId: string;
    region: RuntimeAreaSelectedMessage['area'];
    captureViewport: import('@sniptale/runtime-contracts/video/types/types').ViewportInfo;
  };
  [VideoMessageType.REGION_SELECTION_CANCELLED]: {
    type: typeof VideoMessageType.REGION_SELECTION_CANCELLED;
    regionSelectionCapabilityToken: string;
    regionSelectionRequestGeneration: string;
    regionSelectionRequestId: string;
  };
  [VideoMessageType.DESKTOP_MEDIA_OBTAINED]: RuntimeDesktopMediaObtainedMessage;
  [VideoMessageType.DESKTOP_MEDIA_CANCELLED]: {
    type: typeof VideoMessageType.DESKTOP_MEDIA_CANCELLED;
    desktopMediaRequestGeneration: string;
    desktopMediaRequestId: string;
    sourceIndex?: number;
    sourceCount?: number;
  };
  [VideoMessageType.DESKTOP_MEDIA_FAILED]: {
    type: typeof VideoMessageType.DESKTOP_MEDIA_FAILED;
    desktopMediaRequestGeneration: string;
    desktopMediaRequestId: string;
    error: string;
    phase: 'desktop-stream-acquire' | 'display-media-acquire';
    sourceIndex?: number;
    sourceCount?: number;
  };
  [VideoMessageType.CAPTURE_SOURCE_OBTAINED]: {
    type: typeof VideoMessageType.CAPTURE_SOURCE_OBTAINED;
    captureSource: CaptureSource;
  };
};
