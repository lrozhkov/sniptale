import type { ExportProgress } from '@sniptale/runtime-contracts/export';

interface ExportDiagnosticTimelineEvent {
  elapsedMs: number;
  phase: ExportProgress['phase'];
  step: ExportProgress['activeStepKey'] | 'exportRun';
}

export type ExportManagerState = {
  abortController: AbortController | null;
  isCancelled: boolean;
  previewToDownloadMap: Map<string, string>;
  progressCallback: ((progress: ExportProgress) => void) | null;
  diagnosticTimeline: ExportDiagnosticTimelineEvent[];
  diagnosticTimelineStartedAt: number;
  urlUuidToFilename: Map<string, string>;
};

export function createExportManagerState(): ExportManagerState {
  return {
    progressCallback: null,
    diagnosticTimeline: [],
    diagnosticTimelineStartedAt: Date.now(),
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
  state.diagnosticTimelineStartedAt = Date.now();
  state.diagnosticTimeline = [{ elapsedMs: 0, phase: 'scanning', step: 'exportRun' }];
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
  const step = progress.activeStepKey ?? null;
  const phase = progress.phase ?? 'idle';
  const previous = state.diagnosticTimeline.at(-1);
  if (previous?.step !== step || previous.phase !== phase) {
    state.diagnosticTimeline.push({
      elapsedMs: Math.max(0, Date.now() - state.diagnosticTimelineStartedAt),
      phase,
      step,
    });
  }
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
