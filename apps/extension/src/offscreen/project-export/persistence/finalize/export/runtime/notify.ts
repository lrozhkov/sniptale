import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { type VideoExportFormat } from '../../../../../../features/video/project/types/export';
import { sendRuntimeMessageBestEffort } from '../../../../../runtime-messaging/best-effort';
import { markProjectExportJobTerminal } from '../../../../../../composition/persistence/export-ledger';

const logger = createLogger({ namespace: 'OffscreenProjectExportPersistence' });

interface NotifyProjectExportCompletedOptions {
  isCancelled?: () => boolean;
  signal?: AbortSignal;
}

function assertCompletionNotCancelled(options: NotifyProjectExportCompletedOptions = {}): void {
  if (options.signal?.aborted || options.isCancelled?.()) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }
}

/**
 * Notify the runtime that the project export completed successfully.
 */
export async function notifyProjectExportCompleted(
  params: {
    exportId: string;
    filename: string;
    format: VideoExportFormat;
    jobId: string;
    projectId: string;
    recordingId: string;
  },
  options: NotifyProjectExportCompletedOptions = {}
): Promise<boolean> {
  assertCompletionNotCancelled(options);
  const terminalEntry = await markProjectExportJobTerminal(params.jobId, 'completed');
  if (terminalEntry?.status === 'cancelled') {
    return false;
  }
  sendRuntimeMessageBestEffort({
    context: {
      exportId: params.exportId,
      jobId: params.jobId,
      projectId: params.projectId,
      recordingId: params.recordingId,
    },
    logger,
    logMessage: 'Failed to notify runtime about completed project export',
    payload: {
      type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
      jobId: params.jobId,
      projectId: params.projectId,
      recordingId: params.recordingId,
      exportId: params.exportId,
      filename: params.filename,
      format: params.format,
    },
  });
  return true;
}
