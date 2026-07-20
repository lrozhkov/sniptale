import { createLogger } from '@sniptale/platform/observability/logger';
import { getPageDimensions } from '../page-state/index';
import type { FullPageCaptureOptions } from './types';
import { captureViewportParts } from './capture-parts';
import { cleanupCapture, finalizeCapture, prepareCaptureEnvironment } from './lifecycle';
import { stitchCaptureParts } from './stitch';
import { createCaptureJob, transitionCaptureJob } from '../jobs/state-machine';

const logger = createLogger({ namespace: 'BackgroundFullPageCapture' });

type FullPageCaptureTransaction = {
  dataUrl: string;
  jobId: string;
};

export async function captureFullPageTransaction(
  tabId: number,
  onProgress?: (current: number, total: number) => void,
  options: FullPageCaptureOptions = {}
): Promise<FullPageCaptureTransaction> {
  logger.log('Starting full-page capture', { tabId });
  const job = await createCaptureJob(tabId);

  try {
    await transitionCaptureJob(job.jobId, 'capturing');
    await prepareCaptureEnvironment(tabId);
    const dimensions = await getPageDimensions(tabId);
    logger.debug('Resolved page dimensions', dimensions);

    const parts = await captureViewportParts(tabId, dimensions, onProgress);
    await transitionCaptureJob(job.jobId, 'rendering');
    const dataUrl = await stitchCaptureParts(parts, dimensions.devicePixelRatio, tabId, options);

    await finalizeCapture(tabId);
    logger.log('Full-page capture completed', { parts: parts.length, tabId });
    return { dataUrl, jobId: job.jobId };
  } catch (error) {
    logger.error('Full-page capture failed', error);
    await transitionCaptureJob(job.jobId, 'failed', {
      error: error instanceof Error ? error.message : 'Full-page capture failed',
    }).catch((transitionError) => {
      logger.warn('Failed to mark full-page capture job as failed', transitionError);
    });
    await cleanupCapture(tabId);
    throw error;
  }
}

export async function captureFullPage(
  tabId: number,
  onProgress?: (current: number, total: number) => void,
  options: FullPageCaptureOptions = {}
): Promise<string> {
  const transaction = await captureFullPageTransaction(tabId, onProgress, options);
  await transitionCaptureJob(transaction.jobId, 'completed');
  return transaction.dataUrl;
}
