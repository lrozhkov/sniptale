import {
  CaptureMessageType,
  MessageType,
  type TabModeMessage,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoControlMessage } from '../../../../../contracts/video/types/messages';
import {
  isActivateVideoRecordingSurfaceMessage,
  isReleaseVideoRecordingSurfaceMessage,
  isStartSavedTabVideoRecordingMessage,
  isVideoRecordingSurfaceCommandMessage,
  isVideoRecordingCameraOfferMessage,
  isVideoRecordingCameraCloseMessage,
} from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { RouteCaptureMessage } from '../../../../capture/routes';
import { scenarioRouteMessageTypes } from '../../../../scenario/router/route-descriptors';
import type {
  BackgroundInternalSignalMessage,
  BackgroundTabMessage,
  PopupExportViewerMessage,
  RuntimeMessageEnvelope,
  ScenarioMessage,
  VideoRecordingSurfaceMessage,
} from './shared';

const backgroundInternalSignalTypes = [
  VideoMessageType.COUNTDOWN_COMPLETE,
  'KEEP_ALIVE',
] as const satisfies ReadonlyArray<BackgroundInternalSignalMessage['type']>;

const captureMessageTypes = [
  'TRIGGER_QUICK_ACTION',
  'PREPARE_DESKTOP_SCREENSHOT_CAPTURE',
  'TRIGGER_SCREENSHOT_CAPTURE',
  MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
  MessageType.OPEN_EXPORT_MODAL,
  CaptureMessageType.CAPTURE_VISIBLE,
  CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
  CaptureMessageType.CAPTURE_FULL,
  CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION,
  MessageType.EXECUTE_SAVE,
  MessageType.EXPORT_CAPTURE_FULL_PAGE,
  MessageType.OPEN_EDITOR_WITH_IMAGE,
  MessageType.SAVE_SCREENSHOT_TO_GALLERY,
  MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
  MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
  MessageType.FETCH_WEB_SNAPSHOT_ASSET,
  MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
  MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS,
] as const satisfies ReadonlyArray<RouteCaptureMessage['type']>;

const scenarioMessageTypes = scenarioRouteMessageTypes satisfies ReadonlyArray<
  ScenarioMessage['type']
>;

const tabModeMessageTypes = [
  MessageType.ENABLE_SCREENSHOT_MODE,
  MessageType.DISABLE_SCREENSHOT_MODE,
  MessageType.SCREENSHOT_MODE_STATUS,
  MessageType.ENABLE_HIGHLIGHTER_MODE,
  MessageType.DISABLE_HIGHLIGHTER_MODE,
  MessageType.HIGHLIGHTER_MODE_STATUS,
  MessageType.ENABLE_QUICK_EDIT_MODE,
  MessageType.DISABLE_QUICK_EDIT_MODE,
  MessageType.QUICK_EDIT_MODE_STATUS,
  MessageType.APPLY_VIEWPORT_PRESET,
  MessageType.RELEASE_VIEWPORT_PRESET,
  MessageType.GET_VIEWPORT_PRESET_AVAILABILITY,
  MessageType.GET_VIEWPORT_STATUS,
] as const satisfies ReadonlyArray<TabModeMessage['type']>;

const popupExportViewerMessageTypes = [
  MessageType.EXPORT_POPUP_PREVIEW,
  MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  MessageType.EXPORT_POPUP_CANCEL,
  MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT,
] as const satisfies ReadonlyArray<PopupExportViewerMessage['type']>;

type SupportedPopupExportViewerType = (typeof popupExportViewerMessageTypes)[number];
type SupportedPopupExportViewerMessage = Extract<
  PopupExportViewerMessage,
  { type: SupportedPopupExportViewerType }
>;

type SupportedTabModeType = (typeof tabModeMessageTypes)[number];
type SupportedTabModeMessage = Extract<TabModeMessage, { type: SupportedTabModeType }>;

const videoControlMessageTypes = [
  VideoMessageType.START_RECORDING,
  VideoMessageType.CANCEL_RECORDING_START,
  VideoMessageType.STOP_RECORDING,
  VideoMessageType.PAUSE_RECORDING,
  VideoMessageType.RESUME_RECORDING,
  VideoMessageType.UPDATE_SETTINGS,
] as const satisfies ReadonlyArray<VideoControlMessage['type']>;

const videoRecordingSurfaceMessageTypes = [
  VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING,
  VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE,
  VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE,
  VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
  VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER,
  VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE,
] as const satisfies ReadonlyArray<VideoRecordingSurfaceMessage['type']>;

export const backgroundTabMessageTypes = [
  ...tabModeMessageTypes,
  ...scenarioMessageTypes,
  ...popupExportViewerMessageTypes,
  ...captureMessageTypes,
  ...videoControlMessageTypes,
  ...videoRecordingSurfaceMessageTypes,
] as const satisfies ReadonlyArray<BackgroundTabMessage['type']>;

export function isBackgroundInternalSignalMessage(
  message: RuntimeMessageEnvelope
): message is BackgroundInternalSignalMessage {
  return backgroundInternalSignalTypes.includes(
    message.type as BackgroundInternalSignalMessage['type']
  );
}

export function isTabModeMessage(
  message: RuntimeMessageEnvelope
): message is SupportedTabModeMessage {
  return tabModeMessageTypes.includes(message.type as SupportedTabModeType);
}

export function isRouteCaptureMessage(
  message: RuntimeMessageEnvelope
): message is RouteCaptureMessage {
  return captureMessageTypes.includes(message.type as RouteCaptureMessage['type']);
}

export function isPopupExportViewerMessage(
  message: RuntimeMessageEnvelope
): message is SupportedPopupExportViewerMessage {
  return popupExportViewerMessageTypes.includes(message.type as SupportedPopupExportViewerType);
}

export function isScenarioMessage(message: RuntimeMessageEnvelope): message is ScenarioMessage {
  return scenarioMessageTypes.includes(message.type as ScenarioMessage['type']);
}

export function isVideoControlMessage(
  message: RuntimeMessageEnvelope
): message is VideoControlMessage {
  return videoControlMessageTypes.includes(message.type as VideoControlMessage['type']);
}

export function isVideoRecordingSurfaceMessage(
  message: RuntimeMessageEnvelope
): message is VideoRecordingSurfaceMessage {
  return (
    isStartSavedTabVideoRecordingMessage(message) ||
    isActivateVideoRecordingSurfaceMessage(message) ||
    isReleaseVideoRecordingSurfaceMessage(message) ||
    isVideoRecordingSurfaceCommandMessage(message) ||
    isVideoRecordingCameraOfferMessage(message) ||
    isVideoRecordingCameraCloseMessage(message)
  );
}

export function isBackgroundTabMessage(
  message: RuntimeMessageEnvelope
): message is BackgroundTabMessage {
  return (
    isTabModeMessage(message) ||
    isScenarioMessage(message) ||
    isPopupExportViewerMessage(message) ||
    isRouteCaptureMessage(message) ||
    isVideoControlMessage(message) ||
    isVideoRecordingSurfaceMessage(message)
  );
}
