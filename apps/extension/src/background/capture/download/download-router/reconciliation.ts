import type { CaptureJobRecord } from '../../jobs/state-machine';
import { defaultDownloadRouterService } from './service-singleton';

export async function reconcileCaptureJobDownloadOnStartup(
  job: CaptureJobRecord
): Promise<'completed' | 'failed' | 'missing' | 'pending' | 'rebound'> {
  if (typeof job.downloadId !== 'number') {
    return 'missing';
  }

  return defaultDownloadRouterService.reconcileCaptureJobDownload(job.downloadId, job.jobId);
}
