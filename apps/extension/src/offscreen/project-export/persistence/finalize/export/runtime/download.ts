import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessageBestEffort } from '../../../../../runtime-messaging/best-effort';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const logger = createLogger({ namespace: 'OffscreenProjectExportPersistence' });

/**
 * Request a download for the finalized recording when the caller enabled that follow-up.
 */
export function downloadExportRecording(
  recordingId: string,
  filename: string,
  enabled: boolean
): void {
  if (!enabled) {
    return;
  }

  sendRuntimeMessageBestEffort({
    logger,
    logMessage: 'Failed to trigger recording download after project export',
    payload: {
      type: VideoMessageType.DOWNLOAD_RECORDING,
      recordingId,
      filename,
    },
  });
}
