import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  RegionCaptureControlMessageType,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';
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

export type RegionCaptureMessage = Extract<
  ContentRuntimeMessage,
  {
    type:
      | typeof RegionCaptureControlMessageType.START
      | typeof RegionCaptureControlMessageType.STOP
      | typeof RegionCaptureControlMessageType.CHECK_SUPPORT;
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
      | VideoMessageType.ENABLE_ANNOTATIONS
      | VideoMessageType.DISABLE_ANNOTATIONS
      | VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE
      | VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE
      | VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE
      | VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE;
  }
>;

type PageStyleMessage = Extract<
  ContentRuntimeMessage,
  {
    type:
      | typeof MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY
      | typeof MessageType.OPEN_PAGE_STYLE_INSPECTOR;
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

export function isRegionCaptureMessage(
  message: ContentRuntimeMessage
): message is RegionCaptureMessage {
  return (
    message.type === RegionCaptureControlMessageType.START ||
    message.type === RegionCaptureControlMessageType.STOP ||
    message.type === RegionCaptureControlMessageType.CHECK_SUPPORT
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
    message.type === VideoMessageType.ENABLE_ANNOTATIONS ||
    message.type === VideoMessageType.DISABLE_ANNOTATIONS ||
    message.type === VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE ||
    message.type === VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE ||
    message.type === VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE ||
    message.type === VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE
  );
}

export function isPageStyleMessage(message: ContentRuntimeMessage): message is PageStyleMessage {
  return (
    message.type === MessageType.GET_PAGE_STYLE_CURRENT_RULE_SUMMARY ||
    message.type === MessageType.OPEN_PAGE_STYLE_INSPECTOR
  );
}
