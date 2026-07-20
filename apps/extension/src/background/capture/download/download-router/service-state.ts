import { browserDownloads } from '@sniptale/platform/browser/downloads';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'BackgroundDownloadRouterService' });

export type DownloadTerminalState = 'complete' | 'interrupted' | 'replaced' | 'timeout';

export async function readCurrentTerminalDownloadState(
  downloadId: number
): Promise<Extract<DownloadTerminalState, 'complete' | 'interrupted'> | null> {
  if (typeof browserDownloads.search !== 'function') {
    return null;
  }
  const downloads = await Promise.resolve(browserDownloads.search({ id: downloadId })).catch(
    (error: unknown) => {
      logger.warn('Failed to reconcile registered download state', error);
      return [];
    }
  );
  const download = Array.isArray(downloads) ? downloads[0] : undefined;
  return download?.state === 'complete' || download?.state === 'interrupted'
    ? download.state
    : null;
}
