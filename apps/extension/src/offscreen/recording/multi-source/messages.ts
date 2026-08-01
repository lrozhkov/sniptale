import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessage } from '../../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { WebcamActualSettings } from '@sniptale/runtime-contracts/video/types/types';
import { stageAndPublishPostRecordResult } from '../post-record-publication';

const logger = createLogger({ namespace: 'OffscreenMultiSourceMessages' });

export function notifyMultiSourceStarted(
  recordingId: string,
  webcamSettings: WebcamActualSettings | null = null
): void {
  void sendRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_RECORDING_STARTED,
    recordingId,
    ...(webcamSettings === null ? {} : { webcamSettings }),
  }).catch((error) => {
    logger.debug('Failed to notify multi-source start', error);
  });
}

export function notifyMultiSourceRuntimeFailure(recordingId: string, error: Error): void {
  void sendRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_ERROR,
    error: error.message,
    phase: 'runtime',
    recordingId,
  }).catch((notifyError) => {
    logger.debug('Failed to notify multi-source runtime failure', notifyError);
  });
}

export async function notifyMultiSourceStopped(recordingId: string): Promise<void> {
  await sendRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
    recordingId,
  }).catch((error) => {
    logger.debug('Failed to notify multi-source stop', error);
  });
}

export async function notifyMultiSourceSaved(params: {
  primaryRecordingId: string;
  projectId: string | null;
  recordingId: string;
}): Promise<void> {
  await stageAndPublishPostRecordResult(
    {
      primaryRecordingId: params.primaryRecordingId,
      projectId: params.projectId,
      recordingId: params.recordingId,
    },
    { sendRuntimeMessage }
  );
}
