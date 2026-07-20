import { browserStorage } from '../infrastructure/browser-storage';
import { enqueueProjectExportLedgerWrite, PROJECT_EXPORT_JOB_LEDGER_KEY } from './write-queue';

export async function clearProjectExportJobLedgerForPrivacyErasure(): Promise<void> {
  await enqueueProjectExportLedgerWrite(async () => {
    if (!browserStorage.session.isAvailable()) {
      throw new Error('Project export ledger storage is unavailable');
    }
    await browserStorage.session.remove(PROJECT_EXPORT_JOB_LEDGER_KEY);
  });
}
