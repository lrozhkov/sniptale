import type { TabMessageType } from '../../../contracts/messaging/tab';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  RegionCaptureControlMessageType,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';

type RuntimeMessageTypeEnvelope<TType extends string = string> = { type: TType };
type UiRuntimeBridgeMessageType =
  | MessageType.ENABLE_SCREENSHOT_MODE
  | MessageType.DISABLE_SCREENSHOT_MODE
  | MessageType.DESTROY_UI_TOOLBAR
  | MessageType.SHOW_TOOLBAR
  | MessageType.HIDE_TOOLBAR
  | MessageType.TOOLBAR_STATUS
  | MessageType.VIEWPORT_CHANGED
  | MessageType.SHOW_SAVE_DIALOG
  | MessageType.SHOW_QUICK_ACTION_COUNTDOWN
  | MessageType.SHOW_TOAST
  | MessageType.COPY_IMAGE_TO_CLIPBOARD
  | MessageType.COPY_TEXT_TO_CLIPBOARD
  | MessageType.EXPORT_POPUP_PREVIEW
  | MessageType.EXPORT_POPUP_START
  | MessageType.EXPORT_POPUP_BUILD_PACKAGE
  | typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT
  | MessageType.EXPORT_POPUP_CANCEL
  | VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER
  | VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER;

const topLevelContentRuntimeMessageTypes = new Set<TabMessageType>([
  MessageType.ENABLE_SCREENSHOT_MODE,
  MessageType.DISABLE_SCREENSHOT_MODE,
  MessageType.ENABLE_HIGHLIGHTER_MODE,
  MessageType.DISABLE_HIGHLIGHTER_MODE,
  MessageType.ENABLE_QUICK_EDIT_MODE,
  MessageType.DISABLE_QUICK_EDIT_MODE,
  MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY,
  MessageType.OPEN_PAGE_STYLE_INSPECTOR,
  VideoMessageType.GET_VIEWPORT_COORDS,
  VideoMessageType.SHOW_COUNTDOWN,
  VideoMessageType.HIDE_COUNTDOWN,
  VideoMessageType.ENABLE_ANNOTATIONS,
  VideoMessageType.DISABLE_ANNOTATIONS,
  VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
  RegionCaptureControlMessageType.START,
  RegionCaptureControlMessageType.STOP,
  RegionCaptureControlMessageType.CHECK_SUPPORT,
  VideoMessageType.SHOW_REGION_SELECTOR,
  VideoMessageType.HIDE_REGION_SELECTOR,
  VideoMessageType.REGION_SELECTED,
  VideoMessageType.SHOW_RECORDING_OVERLAY,
  VideoMessageType.HIDE_RECORDING_OVERLAY,
]);

const uiRuntimeBridgeMessageTypes = new Set<UiRuntimeBridgeMessageType>([
  MessageType.ENABLE_SCREENSHOT_MODE,
  MessageType.DISABLE_SCREENSHOT_MODE,
  MessageType.DESTROY_UI_TOOLBAR,
  MessageType.SHOW_TOOLBAR,
  MessageType.HIDE_TOOLBAR,
  MessageType.TOOLBAR_STATUS,
  MessageType.VIEWPORT_CHANGED,
  MessageType.SHOW_SAVE_DIALOG,
  MessageType.SHOW_QUICK_ACTION_COUNTDOWN,
  MessageType.SHOW_TOAST,
  MessageType.COPY_IMAGE_TO_CLIPBOARD,
  MessageType.COPY_TEXT_TO_CLIPBOARD,
  MessageType.EXPORT_POPUP_PREVIEW,
  MessageType.EXPORT_POPUP_START,
  MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  MessageType.EXPORT_POPUP_CANCEL,
  VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER,
  VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasRuntimeMessageType<TType extends string>(
  message: unknown
): message is RuntimeMessageTypeEnvelope<TType> {
  return isRecord(message) && typeof message['type'] === 'string';
}

export function isTopLevelContentRuntimeMessage(message: unknown): boolean {
  return (
    hasRuntimeMessageType<TabMessageType>(message) &&
    topLevelContentRuntimeMessageTypes.has(message['type'])
  );
}

export function isUiRuntimeBridgeMessage(message: unknown): boolean {
  return (
    hasRuntimeMessageType<UiRuntimeBridgeMessageType>(message) &&
    uiRuntimeBridgeMessageTypes.has(message['type'])
  );
}
