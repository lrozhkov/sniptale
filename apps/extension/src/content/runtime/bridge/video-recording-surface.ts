import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentRuntimeHandlerResult, ContentRuntimeMessage } from './types';
import {
  receiveVideoRecordingRuntimeState,
  receiveVideoRecordingSurfaceSnapshot,
} from '../../overlay/video-recording/transport/snapshot-channel';

export function handleVideoRecordingSurfaceSnapshotMessage(
  message: ContentRuntimeMessage,
  sendResponse: ResponseSender
): ContentRuntimeHandlerResult {
  if (message.type !== VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT) {
    if (message.type !== VideoMessageType.RECORDING_STATE_SYNC) return null;
    receiveVideoRecordingRuntimeState(message.state);
    sendResponse({ success: true });
    return false;
  }

  receiveVideoRecordingSurfaceSnapshot(message);
  sendResponse({ success: true });
  return false;
}
