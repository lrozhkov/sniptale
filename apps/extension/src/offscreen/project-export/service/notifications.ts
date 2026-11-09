import { ExportEnhancementError } from '../../../features/video/composition/export-enhancement/enhancer';
import { translate } from '../../../platform/i18n';
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

function exportFailureMessage(error: unknown): string {
  if (!(error instanceof ExportEnhancementError))
    return error instanceof Error ? error.message : String(error);
  switch (error.code) {
    case 'unavailable':
      return translate('videoEditor.exportDialog.detailEnhancementUnavailable');
    case 'initialization-failed':
      return translate('videoEditor.exportDialog.detailEnhancementInitFailed');
    case 'device-lost':
      return translate('videoEditor.exportDialog.detailEnhancementDeviceLost');
    case 'busy':
    case 'disposed':
    case 'invalid-input':
    case 'invalid-output':
      return translate('videoEditor.exportDialog.detailEnhancementFailed');
  }
}

export async function sendProjectExportFailed(jobId: string, error: unknown): Promise<void> {
  const errorMessage = exportFailureMessage(error);
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
