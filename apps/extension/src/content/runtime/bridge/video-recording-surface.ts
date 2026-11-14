import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentRuntimeHandlerResult, ContentRuntimeMessage } from './types';
import {
  prepareVideoRecordingCapture,
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

  if (message.capturePreparation) {
    const requestId = message.capturePreparation.requestId;
    void prepareVideoRecordingCapture(message).then(
      () => sendResponse({ success: true, capturePreparationId: requestId }),
      () => sendResponse({ success: false, error: 'Recording drawing surface preparation failed' })
    );
    return true;
  }
  receiveVideoRecordingSurfaceSnapshot(message);
  sendResponse({ success: true });
  return false;
}
