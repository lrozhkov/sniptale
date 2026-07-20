import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessageBestEffort } from '../../../../../../runtime-messaging/best-effort';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const logger = createLogger({ namespace: 'OffscreenProjectExportPersistence' });

export function requestSidecarDownload(payload: {
  content: string;
  filename: string;
  mimeType: string;
}): void {
  sendRuntimeMessageBestEffort({
    logger,
    logMessage: 'Failed to trigger subtitle sidecar download after project export',
    payload: {
      type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
      content: payload.content,
      filename: payload.filename,
      mimeType: payload.mimeType,
    },
  });
}
