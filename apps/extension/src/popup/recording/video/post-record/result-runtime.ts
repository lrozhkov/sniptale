import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { getPopupRuntimeServices } from '../../../runtime-services';

export async function loadPendingVideoPostRecordResult(): Promise<VideoPostRecordResult | null> {
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: VideoMessageType.GET_RECORDING_STATE,
  });
  if (response?.success !== true) {
    throw new Error(response?.error || 'Failed to verify the post-record result.');
  }
  if (!response.postRecordResult) {
    return null;
  }

  return response.postRecordResult;
}

export async function acknowledgeVideoPostRecordResult(
  recordingId: string
): Promise<'acknowledged' | 'stale'> {
  const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
    type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
    recordingId,
  });
  if (response?.success !== true) {
    throw new Error(response?.error || 'Failed to acknowledge the post-record result.');
  }
  if (response.result !== 'acknowledged' && response.result !== 'stale') {
    throw new Error('Invalid post-record acknowledgement response.');
  }
  return response.result;
}
