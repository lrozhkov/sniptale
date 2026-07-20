import {
  CaptureMessageType,
  MessageType,
  type TabModeMessage,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoControlMessage } from '../../../../../contracts/video/types/messages';
import type { RouteCaptureMessage } from '../../../../capture/routes';
import { scenarioRouteMessageTypes } from '../../../../scenario/router/route-descriptors';
import type {
  BackgroundInternalSignalMessage,
  BackgroundTabMessage,
  PopupExportViewerMessage,
  RuntimeMessageEnvelope,
  ScenarioMessage,
} from './shared';
import {
  isPageStyleRuntimeMessage,
  pageStyleRuntimeMessageTypes,
} from '../../../../capture/routes';

const backgroundInternalSignalTypes = [
  VideoMessageType.COUNTDOWN_COMPLETE,
  'KEEP_ALIVE',
  MessageType.EXPORT_POPUP_PROGRESS,
  MessageType.EXPORT_POPUP_RESULT,
] as const satisfies ReadonlyArray<BackgroundInternalSignalMessage['type']>;

const captureMessageTypes = [
  'TRIGGER_QUICK_ACTION',
  CaptureMessageType.CAPTURE_VISIBLE,
  CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
  CaptureMessageType.CAPTURE_FULL,
  MessageType.EXECUTE_SAVE,
  MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY,
  MessageType.EXPORT_START_HAR,
  MessageType.EXPORT_STOP_HAR,
  MessageType.EXPORT_CAPTURE_FULL_PAGE,
  MessageType.OPEN_EDITOR_WITH_IMAGE,
  MessageType.SAVE_SCREENSHOT_TO_GALLERY,
  MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
  MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
  MessageType.FETCH_WEB_SNAPSHOT_ASSET,
  MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
  MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY,
  MessageType.UPDATE_GALLERY_IMAGE_ASSET,
  MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
  MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
  MessageType.RELEASE_RECORDING_DOWNLOAD,
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
  MessageType.SET_VIEWPORT,
  MessageType.GET_VIEWPORT_STATUS,
] as const satisfies ReadonlyArray<TabModeMessage['type']>;

const popupExportViewerMessageTypes = [
  MessageType.EXPORT_POPUP_PREVIEW,
  MessageType.EXPORT_POPUP_START,
  MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  MessageType.EXPORT_POPUP_CANCEL,
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

export const backgroundTabMessageTypes = [
  ...tabModeMessageTypes,
  ...pageStyleRuntimeMessageTypes,
  ...scenarioMessageTypes,
  ...popupExportViewerMessageTypes,
  ...captureMessageTypes,
  ...videoControlMessageTypes,
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

export function isBackgroundTabMessage(
  message: RuntimeMessageEnvelope
): message is BackgroundTabMessage {
  return (
    isTabModeMessage(message) ||
    isPageStyleRuntimeMessage(message) ||
    isScenarioMessage(message) ||
    isPopupExportViewerMessage(message) ||
    isRouteCaptureMessage(message) ||
    isVideoControlMessage(message)
  );
}
