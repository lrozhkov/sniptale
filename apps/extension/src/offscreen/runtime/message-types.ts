import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const handledOffscreenRuntimeMessageTypes = [
  MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
  VideoMessageType.GET_DESKTOP_MEDIA,
  VideoMessageType.DISPOSE_DESKTOP_MEDIA,
  VideoMessageType.OFFSCREEN_START_RECORDING,
  VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP,
  VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
  VideoMessageType.OFFSCREEN_STOP_RECORDING,
  VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
  VideoMessageType.OFFSCREEN_RESUME_RECORDING,
  VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
  VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
  VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
  VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
] as const;

export type HandledOffscreenRuntimeMessageType =
  (typeof handledOffscreenRuntimeMessageTypes)[number];
