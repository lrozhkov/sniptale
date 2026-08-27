import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { RuntimeMessageType } from '../contracts/runtime-message/index';
import { backgroundIngressContracts } from '../contracts/runtime';
import type { TabMessageType } from '../tab/index';

export const backgroundRuntimeTypes = new Set<RuntimeMessageType>(
  backgroundIngressContracts
    .filter((entry) => entry.boundary === 'background-runtime')
    .map((entry) => entry.type)
);

export const popupRuntimeTypes = new Set<RuntimeMessageType>([
  MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED,
  MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED,
  VideoMessageType.RECORDING_STATE_SYNC,
  VideoMessageType.RECORDING_START_FAILED,
]);

export const offscreenRuntimeTypes = new Set<RuntimeMessageType>([
  MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
  MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE,
  MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD,
  MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME,
  MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
  MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME,
  MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
  MessageType.OFFSCREEN_VOICE_INPUT_START,
  MessageType.OFFSCREEN_VOICE_INPUT_STOP,
  VideoMessageType.GET_DESKTOP_MEDIA,
  VideoMessageType.DISPOSE_DESKTOP_MEDIA,
  VideoMessageType.OFFSCREEN_START_RECORDING,
  VideoMessageType.OFFSCREEN_READINESS_PROBE,
  VideoMessageType.OFFSCREEN_BEGIN_RECORDING,
  VideoMessageType.OFFSCREEN_STOP_RECORDING,
  VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
  VideoMessageType.OFFSCREEN_RESUME_RECORDING,
  VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
  VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
  VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
  VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH,
  VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES,
  VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
  VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
  VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
]);

export const contentTabTypes = new Set<TabMessageType>([
  VideoMessageType.RECORDING_STATE_SYNC,
  MessageType.ENABLE_SCREENSHOT_MODE,
  MessageType.DISABLE_SCREENSHOT_MODE,
  MessageType.ENABLE_HIGHLIGHTER_MODE,
  MessageType.DISABLE_HIGHLIGHTER_MODE,
  MessageType.ENABLE_QUICK_EDIT_MODE,
  MessageType.DISABLE_QUICK_EDIT_MODE,
  MessageType.SHOW_TOOLBAR,
  MessageType.HIDE_TOOLBAR,
  MessageType.TOOLBAR_STATUS,
  MessageType.VIEWPORT_CHANGED,
  MessageType.SHOW_SAVE_DIALOG,
  MessageType.SHOW_QUICK_ACTION_COUNTDOWN,
  MessageType.SHOW_TOAST,
  MessageType.COPY_IMAGE_TO_CLIPBOARD,
  MessageType.COPY_TEXT_TO_CLIPBOARD,
  MessageType.DESTROY_UI_TOOLBAR,
  MessageType.EXPORT_POPUP_PREVIEW,
  MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  MessageType.EXPORT_POPUP_CANCEL,
  MessageType.PREPARE_FULL_PAGE_CAPTURE,
  MessageType.HEARTBEAT_FULL_PAGE_CAPTURE,
  MessageType.PREPARE_FULL_PAGE_TILE,
  MessageType.VERIFY_FULL_PAGE_TILE,
  MessageType.RESTORE_FULL_PAGE_CAPTURE,
  VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT,
  VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
  VideoMessageType.SHOW_COUNTDOWN,
  VideoMessageType.HIDE_COUNTDOWN,
  VideoMessageType.GET_VIEWPORT_COORDS,
  VideoMessageType.SHOW_REGION_SELECTOR,
  VideoMessageType.HIDE_REGION_SELECTOR,
  VideoMessageType.REGION_SELECTED,
  VideoMessageType.REGION_SELECTION_CANCELLED,
  VideoMessageType.SHOW_RECORDING_OVERLAY,
  VideoMessageType.HIDE_RECORDING_OVERLAY,
  VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER,
  VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
]);
