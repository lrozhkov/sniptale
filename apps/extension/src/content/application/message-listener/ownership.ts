import type { TabMessageType } from '../../../contracts/messaging/tab';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

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
  MessageType.DISABLE_SCREENSHOT_MODE,
  MessageType.ENABLE_HIGHLIGHTER_MODE,
  MessageType.DISABLE_HIGHLIGHTER_MODE,
  MessageType.ENABLE_QUICK_EDIT_MODE,
  MessageType.DISABLE_QUICK_EDIT_MODE,
  MessageType.PREPARE_FULL_PAGE_CAPTURE,
  MessageType.HEARTBEAT_FULL_PAGE_CAPTURE,
  MessageType.PREPARE_FULL_PAGE_TILE,
  MessageType.VERIFY_FULL_PAGE_TILE,
  MessageType.RESTORE_FULL_PAGE_CAPTURE,
  VideoMessageType.GET_VIEWPORT_COORDS,
  VideoMessageType.SHOW_COUNTDOWN,
  VideoMessageType.HIDE_COUNTDOWN,
  VideoMessageType.ENABLE_VIEWPORT_CURSOR_PROJECTION,
  VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION,
  VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
  VideoMessageType.RECORDING_STATE_SYNC,
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
