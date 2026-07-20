export const PROJECT_EXPORT_JOB_LEDGER_KEY = 'sniptale_project_export_active_job';

// policyStateId: project-export-job-ledger.
let ledgerWriteQueue: Promise<unknown> = Promise.resolve();

export function enqueueProjectExportLedgerWrite<T>(write: () => Promise<T>): Promise<T> {
  const nextWrite = ledgerWriteQueue.then(write, write);
  ledgerWriteQueue = nextWrite.catch(() => undefined);
  return nextWrite;
}
