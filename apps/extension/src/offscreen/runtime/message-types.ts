import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export const handledOffscreenRuntimeMessageTypes = [
  MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
  MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE,
  MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD,
  MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME,
  MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
  MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME,
  VideoMessageType.GET_DESKTOP_MEDIA,
  VideoMessageType.DISPOSE_DESKTOP_MEDIA,
  VideoMessageType.OFFSCREEN_START_RECORDING,
  VideoMessageType.OFFSCREEN_BEGIN_RECORDING,
  VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
  VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
  VideoMessageType.OFFSCREEN_STOP_RECORDING,
  VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
  VideoMessageType.OFFSCREEN_RESUME_RECORDING,
  VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
  VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
  VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
  VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
  VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
  VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
] as const;

export type HandledOffscreenRuntimeMessageType =
  (typeof handledOffscreenRuntimeMessageTypes)[number];
