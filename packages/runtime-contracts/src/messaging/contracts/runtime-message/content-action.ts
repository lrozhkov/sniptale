import type { MessageType } from '../../message-types';
import type { VideoMessageType } from '../../../video/messages';
import type { VideoRecordingSurfaceActivation } from '../../../video/types/messages.surface';
import type { RuntimeMessageResponse } from '../response';
import type {
  DesktopScreenshotSelection,
  ScreenshotCaptureConfig,
  ScreenshotImageFormat,
} from '../../../capture/action';
import type {
  ContentPrivilegedActionCapability,
  ContentPrivilegedActionActivationKey,
  ContentPrivilegedActionActivationProof,
  ContentPrivilegedActionActivationPurpose,
  ContentPrivilegedActionRequestSource,
  ContentPrivilegedActionRuntimeToken,
  ContentPrivilegedActionTrustedEventProof,
  ContentPrivilegedActionType,
} from '../../../protocol/content-privileged-action';

type RuntimeEmptyResponse = RuntimeMessageResponse<Record<string, never>>;

export type RuntimeContentActionRequestByType = {
  [VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING]: {
    type: typeof VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING;
    contentIntent: ContentPrivilegedActionCapability;
  };
  [VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE]: {
    type: typeof VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE;
    contentIntent: ContentPrivilegedActionCapability;
  };
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY]: {
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY;
    purpose: ContentPrivilegedActionActivationPurpose;
  };
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN]: {
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN;
    activationProof: ContentPrivilegedActionActivationProof;
    actionType: ContentPrivilegedActionType;
    requestId: string;
  };
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF]: {
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF;
    actionType: ContentPrivilegedActionType;
    requestId: string;
    runtimeToken: string;
  };
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY]: {
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY;
    actionType: ContentPrivilegedActionType;
    requestId: string;
    source: ContentPrivilegedActionRequestSource;
    libraryDestinationRequested?: true;
  };
  [MessageType.OPEN_EDITOR_WITH_IMAGE]: {
    type: typeof MessageType.OPEN_EDITOR_WITH_IMAGE;
    dataUrl: string;
    contentIntent?: ContentPrivilegedActionCapability;
  };
  [MessageType.DOWNLOAD_BROWSER_ANNOTATIONS]: {
    type: typeof MessageType.DOWNLOAD_BROWSER_ANNOTATIONS;
    text: string;
    contentIntent?: ContentPrivilegedActionCapability;
  };
  [MessageType.OPEN_EXPORT_MODAL]: {
    type: typeof MessageType.OPEN_EXPORT_MODAL;
    contentIntent?: ContentPrivilegedActionCapability;
  };
  [MessageType.TRIGGER_QUICK_ACTION]: {
    type: typeof MessageType.TRIGGER_QUICK_ACTION;
    actionId: string;
    contentIntent?: ContentPrivilegedActionCapability;
    desktopSelection?: DesktopScreenshotSelection;
    tabId?: number;
  };
  [MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE]: {
    type: typeof MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE;
    actionId?: string;
    config?: ScreenshotCaptureConfig;
    tabId?: number;
  };
  [MessageType.TRIGGER_SCREENSHOT_CAPTURE]: {
    type: typeof MessageType.TRIGGER_SCREENSHOT_CAPTURE;
    config: ScreenshotCaptureConfig;
    desktopSelection?: DesktopScreenshotSelection;
    tabId?: number;
  };
};

export type RuntimeContentActionResponseByType = {
  [VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING]: RuntimeMessageResponse<VideoRecordingSurfaceActivation>;
  [VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE]: RuntimeMessageResponse<VideoRecordingSurfaceActivation>;
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY]: RuntimeMessageResponse<{
    activationKey?: ContentPrivilegedActionActivationKey;
  }>;
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN]: RuntimeMessageResponse<{
    runtimeToken?: ContentPrivilegedActionRuntimeToken;
  }>;
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF]: RuntimeMessageResponse<{
    trustedEventProof?: ContentPrivilegedActionTrustedEventProof;
  }>;
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY]: RuntimeMessageResponse<{
    contentIntent?: ContentPrivilegedActionCapability;
  }>;
  [MessageType.OPEN_EDITOR_WITH_IMAGE]: RuntimeEmptyResponse;
  [MessageType.DOWNLOAD_BROWSER_ANNOTATIONS]: RuntimeMessageResponse<{
    downloadId?: number;
  }>;
  [MessageType.OPEN_EXPORT_MODAL]: RuntimeEmptyResponse;
  [MessageType.TRIGGER_QUICK_ACTION]: RuntimeMessageResponse<{ result?: string }>;
  [MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE]: RuntimeMessageResponse<{
    result: 'ready';
    imageFormat: ScreenshotImageFormat;
    imageQuality: number;
    requestId: string;
    reservationToken: string;
  }>;
  [MessageType.TRIGGER_SCREENSHOT_CAPTURE]: RuntimeMessageResponse<{ result?: string }>;
};
