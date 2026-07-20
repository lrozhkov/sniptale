import { browserDownloads } from '@sniptale/platform/browser/downloads';
import { createLogger } from '@sniptale/platform/observability/logger';
import { transitionCaptureJob } from '../jobs/state-machine';
import { createDownloadRouterService } from './download-router/service';
import { sanitizeDownloadFilename } from './download-router/path';

const logger = createLogger({ namespace: 'BackgroundCapture' });
const downloadRouterService = createDownloadRouterService();

/**
 * Превращает Blob в DataURL и отдаёт вспомогательные функции для загрузки.
 */
export async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function loadImage(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return await createImageBitmap(blob);
}

export async function downloadImageInServiceWorker(
  dataUrl: string,
  filename: string,
  captureJobId?: string | undefined
): Promise<void> {
  try {
    const downloadId = await browserDownloads.download({
      url: dataUrl,
      filename: sanitizeDownloadFilename(filename),
      saveAs: false,
    });
    if (captureJobId && typeof downloadId === 'number') {
      await downloadRouterService.rememberPendingDownload(
        downloadId,
        () => undefined,
        'generic',
        captureJobId
      );
    }
    if (captureJobId && typeof downloadId !== 'number') {
      await transitionCaptureJob(captureJobId, 'failed', {
        error: 'Download did not return an id',
      });
    }
  } catch (error) {
    if (captureJobId) {
      await transitionCaptureJob(captureJobId, 'failed', {
        error: error instanceof Error ? error.message : 'Download failed to start',
      });
    }
    throw error;
  }

  logger.log('Screenshot saved', sanitizeDownloadFilename(filename));
}
