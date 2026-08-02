import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import {
  CAMERA_RECORDER_GRANT_STORAGE_KEY,
  readCameraRecorderGrant,
} from './camera-recorder-grant';
import {
  createAcknowledgedVideoPostRecordResult,
  readStoredVideoPostRecordResult,
  VIDEO_POST_RECORD_RESULT_STORAGE_KEY,
} from './post-record-result';
import { runSerializedVideoRecordingAuthorityMutation } from './recording-authority-mutation';

type VideoPostRecordAcknowledgement = 'acknowledged' | 'stale';

export function acknowledgePendingVideoPostRecordResult(
  recordingId: string
): Promise<VideoPostRecordAcknowledgement> {
  return runSerializedVideoRecordingAuthorityMutation(async (permit) => {
    if (!browserStorage.session.isAvailable()) {
      throw new Error('Session storage is unavailable for the post-record acknowledgement.');
    }

    const state = await readStoredVideoPostRecordResult();
    if (!state || state.result.recordingId !== recordingId || state.status === 'staged') {
      return 'stale';
    }
    if (state.status === 'acknowledged') {
      return 'acknowledged';
    }

    const grant = await readCameraRecorderGrant();
    const acknowledgedBy =
      grant?.recordingId === recordingId && grant.stage === 'document' && grant.tabId !== null
        ? {
            documentId: grant.documentId,
            senderUrl: grant.senderUrl,
            tabId: grant.tabId,
          }
        : null;
    const values: Record<string, unknown> = {
      [VIDEO_POST_RECORD_RESULT_STORAGE_KEY]: createAcknowledgedVideoPostRecordResult(
        state,
        acknowledgedBy
      ),
    };
    if (grant?.recordingId === recordingId) {
      values[CAMERA_RECORDER_GRANT_STORAGE_KEY] = null;
    }
    await browserStorage.session.set(values, permit);
    return 'acknowledged';
  });
}
