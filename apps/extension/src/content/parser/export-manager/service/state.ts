import type { ExportProgress } from '@sniptale/runtime-contracts/export';

export type ExportManagerState = {
  abortController: AbortController | null;
  isCancelled: boolean;
  previewToDownloadMap: Map<string, string>;
  progressCallback: ((progress: ExportProgress) => void) | null;
  urlUuidToFilename: Map<string, string>;
};

export function createExportManagerState(): ExportManagerState {
  return {
    progressCallback: null,
    abortController: null,
    isCancelled: false,
    previewToDownloadMap: new Map(),
    urlUuidToFilename: new Map(),
  };
}

export function beginExportManagerRun(state: ExportManagerState): void {
  state.isCancelled = false;
  state.abortController = new AbortController();
  state.previewToDownloadMap = new Map();
  state.urlUuidToFilename = new Map();
}

export function cancelExportManagerRun(state: ExportManagerState): void {
  state.isCancelled = true;
  state.abortController?.abort();
}

export function setExportManagerProgressCallback(
  state: ExportManagerState,
  callback: (progress: ExportProgress) => void
): void {
  state.progressCallback = callback;
}

export function updateExportManagerProgress(
  state: ExportManagerState,
  progress: Partial<ExportProgress>
): void {
  if (!state.progressCallback) {
    return;
  }

  state.progressCallback({
    activeStepKey: progress.activeStepKey ?? null,
    phase: progress.phase || 'idle',
    message: progress.message || '',
    current: progress.current || 0,
    total: progress.total || 0,
    errors: progress.errors || [],
  });
}
