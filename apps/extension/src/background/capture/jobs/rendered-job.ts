import { createLogger } from '@sniptale/platform/observability/logger';
import { createCaptureJob, transitionCaptureJob } from './state-machine';

const logger = createLogger({ namespace: 'BackgroundCaptureRenderedJob' });

export async function createRenderedCaptureJob(tabId: number): Promise<string> {
  const job = await createCaptureJob(tabId);

  try {
    await transitionCaptureJob(job.jobId, 'capturing');
    await transitionCaptureJob(job.jobId, 'rendering');
    return job.jobId;
  } catch (error) {
    await transitionCaptureJob(job.jobId, 'failed', {
      error: error instanceof Error ? error.message : 'Capture job preparation failed',
    }).catch((transitionError) => {
      logger.warn('Failed to mark rendered capture job as failed', transitionError);
    });
    throw error;
  }
}
