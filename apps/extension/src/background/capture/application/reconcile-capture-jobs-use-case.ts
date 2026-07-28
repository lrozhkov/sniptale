import { reconcileCaptureJobsOnStartup as reconcileCaptureJobs } from '../jobs/reconciliation';
import { cleanupStoredFullPageCaptureLease } from '../full-page/lifecycle';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  ReconcileCaptureJobsOptions,
  ReconcileCaptureJobsPort,
  ReconcileCaptureJobsSummary,
} from './ports';

const defaultReconcileCaptureJobsPort: ReconcileCaptureJobsPort = reconcileCaptureJobs;
const logger = createLogger({ namespace: 'BackgroundCaptureReconciliation' });

// policyStateId: capture-download-jobs - reconciliation delegates to the capture job store owner.
export async function reconcileCaptureJobsUseCase(
  options: ReconcileCaptureJobsOptions,
  reconcile: ReconcileCaptureJobsPort = defaultReconcileCaptureJobsPort,
  cleanupPendingFullPageCapture: () => Promise<void> = cleanupStoredFullPageCaptureLease
): Promise<ReconcileCaptureJobsSummary> {
  try {
    await cleanupPendingFullPageCapture();
  } catch (error) {
    logger.warn('Pending full-page capture cleanup remains queued for retry', error);
  }
  return reconcile(options);
}
