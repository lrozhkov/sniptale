import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../../contracts/video/types/messages';
import type { RuntimeMessageEnvelope } from './shared';

export const videoRuntimeMessageTypes = [
  VideoMessageType.GET_RECORDING_STATE,
  VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
  VideoMessageType.GET_RECORDING_TAB_ID,
  VideoMessageType.RECORDING_DURATION_UPDATED,
  VideoMessageType.OFFSCREEN_RECORDING_STARTED,
  VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
  VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
  VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
  VideoMessageType.OFFSCREEN_ERROR,
  VideoMessageType.START_PROJECT_EXPORT,
  VideoMessageType.CANCEL_PROJECT_EXPORT,
  VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
  VideoMessageType.PROJECT_EXPORT_PROGRESS,
  VideoMessageType.PROJECT_EXPORT_COMPLETED,
  VideoMessageType.PROJECT_EXPORT_FAILED,
  VideoMessageType.PROJECT_EXPORT_CANCELLED,
  VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
  VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
  VideoMessageType.OFFSCREEN_READY,
  VideoMessageType.CAPTURE_SOURCE_OBTAINED,
  VideoMessageType.DESKTOP_MEDIA_OBTAINED,
  VideoMessageType.DESKTOP_MEDIA_CANCELLED,
  VideoMessageType.DESKTOP_MEDIA_FAILED,
  VideoMessageType.VIDEO_SAVED_TO_IDB,
  VideoMessageType.DOWNLOAD_RECORDING,
] as const satisfies ReadonlyArray<VideoRuntimeMessage['type']>;

export function isVideoRuntimeMessage(
  message: RuntimeMessageEnvelope
): message is VideoRuntimeMessage {
  return videoRuntimeMessageTypes.includes(message.type as VideoRuntimeMessage['type']);
}
