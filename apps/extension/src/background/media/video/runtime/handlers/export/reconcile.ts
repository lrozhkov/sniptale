import { runBestEffort } from '@sniptale/foundation/best-effort';
import { translate } from '../../../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sendRuntimeMessage } from '../../../../../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  loadActiveProjectExportJobLedgerEntry,
  markProjectExportJobTerminal,
} from '../../../../../../composition/persistence/export-ledger';

const logger = createLogger({ namespace: 'BackgroundProjectExportReconcile' });

export async function reconcileProjectExportLedgerAfterOffscreenCreation(
  created: boolean
): Promise<void> {
  if (!created) {
    return;
  }

  const activeLedgerEntry = await loadActiveProjectExportJobLedgerEntry();
  if (!activeLedgerEntry || activeLedgerEntry.status !== 'running') {
    return;
  }

  const errorMessage = translate('offscreenExport.interruptedByRuntimeRestart');
  await markProjectExportJobTerminal(activeLedgerEntry.jobId, 'failed', errorMessage);
  if (!activeLedgerEntry.ownerDocumentId || !activeLedgerEntry.ownerSenderUrl) {
    logger.warn('Interrupted project export has no active editor owner', {
      jobId: activeLedgerEntry.jobId,
    });
    return;
  }

  runBestEffort(
    sendRuntimeMessage({
      type: VideoMessageType.PROJECT_EXPORT_FAILED,
      jobId: activeLedgerEntry.jobId,
      error: errorMessage,
      targetDocumentId: activeLedgerEntry.ownerDocumentId,
      targetSenderUrl: activeLedgerEntry.ownerSenderUrl,
    }),
    logger,
    'Failed to notify runtime about interrupted project export',
    { jobId: activeLedgerEntry.jobId }
  );
}
