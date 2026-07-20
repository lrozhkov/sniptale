import { expect, it, vi } from 'vitest';
import {
  beginExportManagerRun,
  cancelExportManagerRun,
  createExportManagerState,
  setExportManagerProgressCallback,
  updateExportManagerProgress,
} from './state';

it('initializes and resets mutable export-manager runtime state per run', () => {
  const state = createExportManagerState();

  state.isCancelled = true;
  state.previewToDownloadMap.set('preview-a', 'download-a');
  state.urlUuidToFilename.set('uuid-a', 'file-a.txt');

  beginExportManagerRun(state);

  expect(state.isCancelled).toBe(false);
  expect(state.abortController).toBeInstanceOf(AbortController);
  expect(state.previewToDownloadMap.size).toBe(0);
  expect(state.urlUuidToFilename.size).toBe(0);
});

it('cancels the active export-manager run and aborts the signal', () => {
  const state = createExportManagerState();

  beginExportManagerRun(state);
  cancelExportManagerRun(state);

  expect(state.isCancelled).toBe(true);
  expect(state.abortController?.signal.aborted).toBe(true);
});

it('projects progress defaults only when a callback is registered', () => {
  const state = createExportManagerState();
  const progressSpy = vi.fn();

  updateExportManagerProgress(state, { phase: 'done', message: 'ignored' });
  expect(progressSpy).not.toHaveBeenCalled();

  setExportManagerProgressCallback(state, progressSpy);
  updateExportManagerProgress(state, {
    message: 'ready',
    phase: 'done',
  });

  expect(progressSpy).toHaveBeenCalledWith({
    activeStepKey: null,
    phase: 'done',
    message: 'ready',
    current: 0,
    total: 0,
    errors: [],
  });
});
