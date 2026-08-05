import { expect, it, vi } from 'vitest';

const migrateHighlighterSystemPresetCatalog = vi.hoisted(() => vi.fn(async () => true));
const migrateCalloutSystemPresetCatalog = vi.hoisted(() => vi.fn(async () => true));
const migrateStepBadgeSystemPresetCatalog = vi.hoisted(() => vi.fn(async () => true));
const ensureActivePageAccessRuntime = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/highlighter')>()),
  migrateHighlighterSystemPresetCatalog,
}));

vi.mock('../../../../composition/persistence/callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/callout-presets')>()),
  migrateCalloutSystemPresetCatalog,
}));

vi.mock('../../../../composition/persistence/step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/step-badge-presets')
  >()),
  migrateStepBadgeSystemPresetCatalog,
}));

vi.mock('../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/service')>()),
  ensureActivePageAccessRuntime,
}));

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
  recoverVideoCaptureSurfaceOnStartup,
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
  recoverVideoCaptureSurfaceOnStartup.mockRejectedValue(new Error('surface recovery failed'));
  reconcileCaptureJobsOnStartup.mockRejectedValue(new Error('capture reconcile failed'));
  initializeAiStorageAccess.mockRejectedValue(new Error('ai init failed'));
  migrateStepBadgeSystemPresetCatalog.mockRejectedValue(new Error('step badge migration failed'));

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
  expect(migrateHighlighterSystemPresetCatalog).toHaveBeenCalledOnce();
  expect(migrateCalloutSystemPresetCatalog).toHaveBeenCalledOnce();
  expect(migrateStepBadgeSystemPresetCatalog).toHaveBeenCalledOnce();
  expect(resetVideoRecordingRuntimeState).toHaveBeenCalledOnce();
  expect(recoverVideoCaptureSurfaceOnStartup).toHaveBeenCalledWith(ensureActivePageAccessRuntime);
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
  expect(logger.warn).toHaveBeenCalledWith(
    'Step badge preset catalog migration failed (non-critical)',
    expect.any(Error)
  );
  expect(logger.warn).toHaveBeenCalledWith(
    'Capture surface recovery failed; new preset mutations remain blocked',
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
