import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { TabMessageType, TabRequestByType } from '../../../contracts/messaging/tab';

export type ContentRuntimeMessage = TabRequestByType[TabMessageType];

export type CoreModeMessage = Extract<
  ContentRuntimeMessage,
  {
    type:
      | MessageType.ENABLE_SCREENSHOT_MODE
      | MessageType.DISABLE_SCREENSHOT_MODE
      | MessageType.ENABLE_HIGHLIGHTER_MODE
      | MessageType.DISABLE_HIGHLIGHTER_MODE
      | MessageType.ENABLE_QUICK_EDIT_MODE
      | MessageType.DISABLE_QUICK_EDIT_MODE;
  }
>;

export type RegionOverlayMessage = Extract<
  ContentRuntimeMessage,
  {
    type:
      | VideoMessageType.SHOW_REGION_SELECTOR
      | VideoMessageType.HIDE_REGION_SELECTOR
      | VideoMessageType.REGION_SELECTED
      | VideoMessageType.SHOW_RECORDING_OVERLAY
      | VideoMessageType.HIDE_RECORDING_OVERLAY;
  }
>;

export type ViewportMessage = Extract<
  ContentRuntimeMessage,
  {
    type:
      | VideoMessageType.GET_VIEWPORT_COORDS
      | VideoMessageType.SHOW_COUNTDOWN
      | VideoMessageType.HIDE_COUNTDOWN
      | VideoMessageType.ENABLE_VIEWPORT_CURSOR_PROJECTION
      | VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION
      | VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE
      | VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE
      | VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE
      | VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE;
  }
>;

export type ContentRuntimeHandlerResult = boolean | null;

export function isCoreModeMessage(message: ContentRuntimeMessage): message is CoreModeMessage {
  return (
    message.type === MessageType.ENABLE_SCREENSHOT_MODE ||
    message.type === MessageType.DISABLE_SCREENSHOT_MODE ||
    message.type === MessageType.ENABLE_HIGHLIGHTER_MODE ||
    message.type === MessageType.DISABLE_HIGHLIGHTER_MODE ||
    message.type === MessageType.ENABLE_QUICK_EDIT_MODE ||
    message.type === MessageType.DISABLE_QUICK_EDIT_MODE
  );
}

export function isRegionOverlayMessage(
  message: ContentRuntimeMessage
): message is RegionOverlayMessage {
  return (
    message.type === VideoMessageType.SHOW_REGION_SELECTOR ||
    message.type === VideoMessageType.HIDE_REGION_SELECTOR ||
    message.type === VideoMessageType.REGION_SELECTED ||
    message.type === VideoMessageType.SHOW_RECORDING_OVERLAY ||
    message.type === VideoMessageType.HIDE_RECORDING_OVERLAY
  );
}

export function isViewportMessage(message: ContentRuntimeMessage): message is ViewportMessage {
  return (
    message.type === VideoMessageType.GET_VIEWPORT_COORDS ||
    message.type === VideoMessageType.SHOW_COUNTDOWN ||
    message.type === VideoMessageType.HIDE_COUNTDOWN ||
    message.type === VideoMessageType.ENABLE_VIEWPORT_CURSOR_PROJECTION ||
    message.type === VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION ||
    message.type === VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE ||
    message.type === VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE ||
    message.type === VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE ||
    message.type === VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE
  );
}
