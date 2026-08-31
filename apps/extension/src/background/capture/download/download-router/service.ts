import { browserDownloads } from '@sniptale/platform/browser/downloads';
import { createLogger } from '@sniptale/platform/observability/logger';
import { setLastSaveAsDirectory } from '../save-directory';
import { bindDownloadToCaptureJob, transitionCaptureJob } from '../../jobs/state-machine';
import { resolveCompletedSaveAsDirectory } from './save-as-directory';
import { readCurrentTerminalDownloadState, type DownloadTerminalState } from './service-state';

const DEFAULT_DOWNLOAD_TERMINAL_TIMEOUT_MS = 5 * 60 * 1000;
const EXACT_URL_RECONCILIATION_WINDOW_MS = 30_000;
const logger = createLogger({ namespace: 'BackgroundDownloadRouterService' });

export type DownloadTerminalHandler = (state: DownloadTerminalState) => void | Promise<void>;
type PendingDownload = {
  id: number;
  jobId?: string | undefined;
  kind: 'generic' | 'save-as';
  onTerminal: DownloadTerminalHandler;
  timeoutId: ReturnType<typeof setTimeout>;
};
type PendingDownloadStore = Map<number, PendingDownload>;

type DownloadRouterServiceOptions = {
  terminalTimeoutMs?: number;
};
type SaveAsDownloadAttempt = {
  register(downloadId: number | null | undefined): Promise<void>;
};
type DownloadReconciliationResult = 'completed' | 'failed' | 'missing' | 'pending' | 'rebound';
export type ExactUrlDownloadMatch = {
  downloadId: number;
  state: chrome.downloads.DownloadItem['state'];
};
type BrowserDownloadTerminalState = Extract<DownloadTerminalState, 'complete' | 'interrupted'>;
export type DownloadRouterService = {
  beginSaveAsDownloadAttempt(jobId?: string | undefined): SaveAsDownloadAttempt;
  cancelDownloadAndWait(downloadId: number): Promise<BrowserDownloadTerminalState>;
  dispose(): void;
  findDownloadsByExactUrl(args: {
    requestedAt: number;
    url: string;
  }): Promise<ExactUrlDownloadMatch[]>;
  reconcileCaptureJobDownload(
    downloadId: number,
    jobId: string
  ): Promise<DownloadReconciliationResult>;
  rememberPendingDownload(
    downloadId: number,
    onTerminal: DownloadTerminalHandler,
    kind?: PendingDownload['kind'],
    jobId?: string | undefined,
    reconcileCurrent?: boolean
  ): Promise<void>;
  rememberPendingSaveAsDownload(downloadId: number | null): void;
};

function readTerminalState(delta: chrome.downloads.DownloadDelta): DownloadTerminalState | null {
  const state = delta.state?.current;
  return state === 'complete' || state === 'interrupted' ? state : null;
}

class DownloadRouterServiceController {
  private readonly pendingDownloads: PendingDownloadStore = new Map();
  private readonly terminalTimeoutMs: number;
  private saveAsGeneration = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(options: DownloadRouterServiceOptions) {
    this.terminalTimeoutMs = options.terminalTimeoutMs ?? DEFAULT_DOWNLOAD_TERMINAL_TIMEOUT_MS;
  }

  private clearPendingDownload(downloadId: number): void {
    const pendingDownload = this.pendingDownloads.get(downloadId);
    if (!pendingDownload) return;
    clearTimeout(pendingDownload.timeoutId);
    this.pendingDownloads.delete(downloadId);
  }

  private closeSubscription(): void {
    if (this.pendingDownloads.size > 0) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private completePendingDownload(downloadId: number, state: DownloadTerminalState): void {
    const pendingDownload = this.pendingDownloads.get(downloadId);
    const handler = pendingDownload?.onTerminal;
    if (pendingDownload?.jobId) {
      void transitionCaptureJob(
        pendingDownload.jobId,
        state === 'complete' ? 'completed' : 'failed',
        state === 'complete' ? {} : { error: `Download ${state}` }
      ).catch((error: unknown) => {
        logger.warn('Failed to mark capture download job terminal', error);
      });
    }
    this.clearPendingDownload(downloadId);
    this.closeSubscription();
    if (handler) void handler(state);
  }

  private async markCaptureJobFromDownloadState(
    jobId: string,
    state: DownloadTerminalState
  ): Promise<DownloadReconciliationResult> {
    await transitionCaptureJob(
      jobId,
      state === 'complete' ? 'completed' : 'failed',
      state === 'complete' ? {} : { error: `Download ${state}` }
    );
    return state === 'complete' ? 'completed' : 'failed';
  }

  private ensureSubscription(): void {
    this.unsubscribe ??= browserDownloads.subscribeToChanged((delta) => {
      if (delta.id == null || !this.pendingDownloads.has(delta.id)) return;
      const terminalState = readTerminalState(delta);
      if (!terminalState) return;

      this.completePendingDownload(delta.id, terminalState);
    });
  }

  async rememberPendingDownload(
    downloadId: number,
    onTerminal: DownloadTerminalHandler,
    kind: PendingDownload['kind'] = 'generic',
    jobId?: string | undefined,
    reconcileCurrent = jobId !== undefined
  ): Promise<void> {
    this.clearPendingDownload(downloadId);
    if (jobId) {
      try {
        await bindDownloadToCaptureJob(jobId, downloadId);
      } catch (error) {
        await transitionCaptureJob(jobId, 'failed', {
          error: error instanceof Error ? error.message : 'Download binding failed',
        }).catch((transitionError: unknown) => {
          logger.warn('Failed to mark capture download job after bind failure', transitionError);
        });
        throw error;
      }
    }

    this.ensureSubscription();
    this.pendingDownloads.set(downloadId, {
      id: downloadId,
      ...(jobId === undefined ? {} : { jobId }),
      kind,
      onTerminal,
      timeoutId: setTimeout(
        () => this.completePendingDownload(downloadId, 'timeout'),
        this.terminalTimeoutMs
      ),
    });
    if (reconcileCurrent) {
      const terminalState = await readCurrentTerminalDownloadState(downloadId);
      if (terminalState) this.completePendingDownload(downloadId, terminalState);
    }
  }

  async cancelDownloadAndWait(downloadId: number): Promise<BrowserDownloadTerminalState> {
    const existingTerminalState = await readCurrentTerminalDownloadState(downloadId);
    if (existingTerminalState) return existingTerminalState;

    return new Promise<BrowserDownloadTerminalState>((resolve, reject) => {
      const handleTerminal = (state: DownloadTerminalState): void => {
        if (state === 'complete' || state === 'interrupted') resolve(state);
        else
          reject(
            new Error(`Download cancellation did not reach a browser terminal state: ${state}.`)
          );
      };
      void this.rememberPendingDownload(downloadId, handleTerminal, 'generic', undefined, true)
        .then(async () => {
          const terminalBeforeCancel = await readCurrentTerminalDownloadState(downloadId);
          if (terminalBeforeCancel) {
            this.completePendingDownload(downloadId, terminalBeforeCancel);
            return;
          }
          await browserDownloads.cancel(downloadId);
          const terminalState = await readCurrentTerminalDownloadState(downloadId);
          if (terminalState) this.completePendingDownload(downloadId, terminalState);
        })
        .catch((error: unknown) => {
          this.clearPendingDownload(downloadId);
          this.closeSubscription();
          reject(error);
        });
    });
  }

  async findDownloadsByExactUrl(args: {
    requestedAt: number;
    url: string;
  }): Promise<ExactUrlDownloadMatch[]> {
    if (!Number.isSafeInteger(args.requestedAt) || args.requestedAt < 0 || args.url.length === 0) {
      throw new Error('Invalid exact download reconciliation identity.');
    }
    const downloads = await browserDownloads.search({
      startedAfter: new Date(Math.max(0, args.requestedAt - 1_000)).toISOString(),
      startedBefore: new Date(args.requestedAt + EXACT_URL_RECONCILIATION_WINDOW_MS).toISOString(),
    });
    return downloads.flatMap((download) =>
      download.url === args.url || download.finalUrl === args.url
        ? [{ downloadId: download.id, state: download.state }]
        : []
    );
  }

  private clearSaveAsDownloads(): void {
    this.pendingDownloads.forEach((pendingDownload) => {
      if (pendingDownload.kind === 'save-as') {
        this.completePendingDownload(pendingDownload.id, 'replaced');
      }
    });
    this.closeSubscription();
  }

  private async registerSaveAsDownload(
    downloadId: number | null | undefined,
    currentSaveAsGeneration: number,
    jobId?: string | undefined
  ): Promise<void> {
    if (typeof downloadId !== 'number' || currentSaveAsGeneration !== this.saveAsGeneration) {
      if (typeof downloadId === 'number' && jobId) {
        await transitionCaptureJob(jobId, 'failed', { error: 'Download replaced' });
      }
      return;
    }

    await this.rememberPendingDownload(
      downloadId,
      (state) => {
        if (state !== 'complete') return;
        void resolveCompletedSaveAsDirectory(downloadId)
          .then((dir) => {
            if (dir && currentSaveAsGeneration === this.saveAsGeneration) {
              setLastSaveAsDirectory(dir);
            }
          })
          .catch((error: unknown) => {
            logger.warn('Failed to persist Save As directory', error);
          });
      },
      'save-as',
      jobId
    );
  }

  beginSaveAsDownloadAttempt(jobId?: string | undefined): SaveAsDownloadAttempt {
    this.saveAsGeneration += 1;
    const currentSaveAsGeneration = this.saveAsGeneration;
    this.clearSaveAsDownloads();

    return {
      register: (downloadId): Promise<void> => {
        return this.registerSaveAsDownload(downloadId, currentSaveAsGeneration, jobId);
      },
    };
  }

  rememberPendingSaveAsDownload(downloadId: number | null): void {
    void this.beginSaveAsDownloadAttempt().register(downloadId);
  }

  async reconcileCaptureJobDownload(
    downloadId: number,
    jobId: string
  ): Promise<DownloadReconciliationResult> {
    const [download] = await browserDownloads.search({ id: downloadId });
    if (!download) {
      return 'missing';
    }

    if (download.state === 'complete' || download.state === 'interrupted') {
      return this.markCaptureJobFromDownloadState(jobId, download.state);
    }

    await this.rememberPendingDownload(downloadId, () => undefined, 'generic', jobId);
    return 'rebound';
  }

  dispose(): void {
    this.pendingDownloads.forEach((pendingDownload) =>
      this.clearPendingDownload(pendingDownload.id)
    );
    this.closeSubscription();
  }
}

export function createDownloadRouterService(
  options: DownloadRouterServiceOptions = {}
): DownloadRouterService {
  return new DownloadRouterServiceController(options);
}
