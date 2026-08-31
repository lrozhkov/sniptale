import { browserDownloads } from '@sniptale/platform/browser/downloads';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'BackgroundDownloadRouterService' });

export type DownloadTerminalState = 'complete' | 'interrupted' | 'replaced' | 'timeout';

async function readDownloadItem(downloadId: number): Promise<chrome.downloads.DownloadItem | null> {
  if (typeof browserDownloads.search !== 'function') return null;
  const downloads = await Promise.resolve(browserDownloads.search({ id: downloadId })).catch(
    (error: unknown) => {
      logger.warn('Failed to reconcile registered download state', error);
      return [];
    }
  );
  return Array.isArray(downloads) ? (downloads[0] ?? null) : null;
}

export async function readDownloadInterruptionReason(downloadId: number): Promise<string | null> {
  const download = await readDownloadItem(downloadId);
  return download?.state === 'interrupted' && typeof download.error === 'string'
    ? download.error
    : null;
}

export async function readCurrentTerminalDownloadState(
  downloadId: number
): Promise<Extract<DownloadTerminalState, 'complete' | 'interrupted'> | null> {
  const download = await readDownloadItem(downloadId);
  return download?.state === 'complete' || download?.state === 'interrupted'
    ? download.state
    : null;
}
