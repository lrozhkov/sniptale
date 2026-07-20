import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessageBestEffort } from '../../runtime-messaging/best-effort';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { markProjectExportJobTerminal } from '../../../composition/persistence/export-ledger';

const logger = createLogger({ namespace: 'OffscreenProjectExport' });

async function markProjectExportTerminalBestEffort(
  jobId: string,
  status: 'cancelled' | 'failed',
  errorMessage?: string
): Promise<void> {
  try {
    if (errorMessage === undefined) {
      await markProjectExportJobTerminal(jobId, status);
      return;
    }
    await markProjectExportJobTerminal(jobId, status, errorMessage);
  } catch (error) {
    logger.error('Failed to mark project export terminal', error);
  }
}

export async function sendProjectExportCancelled(jobId: string): Promise<void> {
  await markProjectExportTerminalBestEffort(jobId, 'cancelled');
  sendRuntimeMessageBestEffort({
    context: { jobId },
    logger,
    logMessage: 'Failed to notify runtime about cancelled project export',
    payload: {
      type: VideoMessageType.PROJECT_EXPORT_CANCELLED,
      jobId,
    },
  });
}

export async function sendProjectExportFailed(jobId: string, error: unknown): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error('Failed', error);
  await markProjectExportTerminalBestEffort(jobId, 'failed', errorMessage);
  sendRuntimeMessageBestEffort({
    context: { jobId },
    logger,
    logMessage: 'Failed to notify runtime about failed project export',
    payload: {
      type: VideoMessageType.PROJECT_EXPORT_FAILED,
      jobId,
      error: errorMessage,
    },
  });
}
