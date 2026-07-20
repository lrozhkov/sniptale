import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessage } from '../../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { WebcamActualSettings } from '@sniptale/runtime-contracts/video/types/types';

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

export async function notifyMultiSourceStopped(recordingId: string): Promise<void> {
  await sendRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
    recordingId,
  }).catch((error) => {
    logger.debug('Failed to notify multi-source stop', error);
  });
}

export async function notifyMultiSourceSaved(params: {
  projectId: string | null;
  recordingId: string;
}): Promise<void> {
  await sendRuntimeMessage({
    type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    recordingId: params.recordingId,
    ...(params.projectId === null ? {} : { projectId: params.projectId }),
  }).catch((error) => logger.debug('Failed to notify multi-source save', error));
}

export async function triggerMultiSourceDownload(
  recordingId: string,
  filename: string
): Promise<void> {
  await sendRuntimeMessage({
    type: VideoMessageType.DOWNLOAD_RECORDING,
    recordingId,
    filename,
  }).catch((error) => {
    logger.warn('Multi-source backup download failed', error);
  });
}
