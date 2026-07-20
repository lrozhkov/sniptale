import { expect, it, vi } from 'vitest';

import {
  cleanupCapture,
  cleanupExpiredProjectExportInputs,
  cleanupOldRecordings,
  flushMicrotasks,
  initializeBackgroundRuntimeWiringMocks,
  initializeAiStorageAccess,
  reconcileCaptureJobDownloadOnStartup,
  reconcileCaptureJobsOnStartup,
  recoverInterruptedSessions,
  resetVideoRecordingRuntimeState,
  createModeState,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { runStartupMaintenance } from './startup';
import { createViewerPortRegistration } from '../../../capture/page-preparation/viewer-ports.test-support';

const logger = {
  log: vi.fn(),
  warn: vi.fn(),
};

it('runs startup maintenance and warns when maintenance promises reject', async () => {
  const state = createModeState();
  initializeBackgroundRuntimeWiringMocks.ensurePersistentStorage.mockRejectedValue(
    new Error('persist failed')
  );
  cleanupOldRecordings.mockRejectedValue(new Error('cleanup failed'));
  cleanupExpiredProjectExportInputs.mockRejectedValue(new Error('export input cleanup failed'));
  recoverInterruptedSessions.mockRejectedValue(new Error('recovery failed'));
  reconcileCaptureJobsOnStartup.mockRejectedValue(new Error('capture reconcile failed'));
  initializeAiStorageAccess.mockRejectedValue(new Error('ai init failed'));

  runStartupMaintenance(state, logger);
  await flushMicrotasks();

  expect(cleanupOldRecordings).toHaveBeenCalledWith(7);
  expect(cleanupExpiredProjectExportInputs).toHaveBeenCalledOnce();
  expect(recoverInterruptedSessions).toHaveBeenCalledOnce();
  expect(reconcileCaptureJobsOnStartup).toHaveBeenCalledWith({
    cleanupInterruptedCapture: cleanupCapture,
    reconcileExportingDownload: reconcileCaptureJobDownloadOnStartup,
  });
  expect(initializeAiStorageAccess).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeState).toHaveBeenCalledOnce();
  expect(logger.warn).toHaveBeenCalledWith(
    'Failed to request persistent storage',
    expect.any(Error)
  );
  expect(logger.warn).toHaveBeenCalledWith('IDB cleanup failed (non-critical)', expect.any(Error));
  expect(logger.warn).toHaveBeenCalledWith(
    'Project export input cleanup failed (non-critical)',
    expect.any(Error)
  );
  expect(logger.warn).toHaveBeenCalledWith(
    'Diagnostics recovery failed (non-critical)',
    expect.any(Error)
  );
  expect(logger.warn).toHaveBeenCalledWith(
    'Capture job reconciliation failed (non-critical)',
    expect.any(Error)
  );
  expect(logger.warn).toHaveBeenCalledWith(
    'AI storage initialization failed (non-critical)',
    expect.any(Error)
  );
});

it('resets reconstructible and disposable state during startup maintenance', () => {
  const state = createModeState();
  state.captureGuardState.isCapturing = true;
  state.webSnapshotViewerPorts?.set(7, createViewerPortRegistration({}));

  runStartupMaintenance(state, logger);

  expect(state.highlighterModeState).toEqual(new Map());
  expect(state.quickEditModeState).toEqual(new Map());
  expect(state.screenshotModeState).toEqual(new Map());
  expect(state.viewportState).toEqual(new Map());
  expect(state.captureGuardState.isCapturing).toBe(false);
  expect(state.webSnapshotViewerPorts).toEqual(new Map());
});
