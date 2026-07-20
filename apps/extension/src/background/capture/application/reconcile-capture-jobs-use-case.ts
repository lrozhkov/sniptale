import { reconcileCaptureJobsOnStartup as reconcileCaptureJobs } from '../jobs/reconciliation';
import type {
  ReconcileCaptureJobsOptions,
  ReconcileCaptureJobsPort,
  ReconcileCaptureJobsSummary,
} from './ports';

const defaultReconcileCaptureJobsPort: ReconcileCaptureJobsPort = reconcileCaptureJobs;

// policyStateId: capture-download-jobs - reconciliation delegates to the capture job store owner.
export function reconcileCaptureJobsUseCase(
  options: ReconcileCaptureJobsOptions,
  reconcile: ReconcileCaptureJobsPort = defaultReconcileCaptureJobsPort
): Promise<ReconcileCaptureJobsSummary> {
  return reconcile(options);
}
