import { expect, it, vi } from 'vitest';

const migrateHighlighterSystemPresetCatalog = vi.hoisted(() => vi.fn(async () => true));
const migrateCalloutSystemPresetCatalog = vi.hoisted(() => vi.fn(async () => true));
const migrateStepBadgeSystemPresetCatalog = vi.hoisted(() => vi.fn(async () => true));
const ensureActivePageAccessRuntime = vi.hoisted(() => vi.fn(async () => undefined));
const cleanupDrafts = vi.hoisted(() => vi.fn(async () => undefined));
const recoverPendingVideoRecordingCameraPeerCleanup = vi.hoisted(() => vi.fn(async () => true));
const loadSettings = vi.hoisted(() =>
  vi.fn(async () => ({
    localStoragePolicy: {
      cleanupEnabled: true,
      defaultDestination: 'temporary' as const,
      draftRetentionDays: 30,
      videoDraftRetentionDays: 7,
    },
  }))
);

vi.mock('../../../../composition/persistence/library-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/library-lifecycle')
  >()),
  cleanupDrafts,
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings,
}));

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

vi.mock('../../../media/video/content-surface/camera-peer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media/video/content-surface/camera-peer')>()),
  recoverPendingVideoRecordingCameraPeerCleanup,
}));

import {
  cleanupCapture,
  cleanupExpiredProjectExportInputs,
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
  cleanupDrafts.mockRejectedValue(new Error('cleanup failed'));
  cleanupExpiredProjectExportInputs.mockRejectedValue(new Error('export input cleanup failed'));
  recoverInterruptedSessions.mockRejectedValue(new Error('recovery failed'));
  recoverVideoCaptureSurfaceOnStartup.mockRejectedValue(new Error('surface recovery failed'));
  reconcileCaptureJobsOnStartup.mockRejectedValue(new Error('capture reconcile failed'));
  initializeAiStorageAccess.mockRejectedValue(new Error('ai init failed'));
  migrateStepBadgeSystemPresetCatalog.mockRejectedValue(new Error('step badge migration failed'));

  runStartupMaintenance(state, logger);
  await flushMicrotasks();

  expect(cleanupDrafts).toHaveBeenCalledWith({
    policy: {
      cleanupEnabled: true,
      defaultDestination: 'temporary',
      draftRetentionDays: 30,
      videoDraftRetentionDays: 7,
    },
  });
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
  expect(recoverPendingVideoRecordingCameraPeerCleanup).toHaveBeenCalledOnce();
  expect(recoverVideoCaptureSurfaceOnStartup).toHaveBeenCalledWith(ensureActivePageAccessRuntime);
  expect(logger.warn).toHaveBeenCalledWith(
    'Failed to request persistent storage',
    expect.any(Error)
  );
  expect(logger.warn).toHaveBeenCalledWith(
    'Draft cleanup failed (non-critical)',
    expect.any(Error)
  );
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

it('does not schedule draft cleanup when automatic cleanup is disabled', async () => {
  loadSettings.mockResolvedValueOnce({
    localStoragePolicy: {
      cleanupEnabled: false,
      defaultDestination: 'temporary',
      draftRetentionDays: 30,
      videoDraftRetentionDays: 7,
    },
  });

  runStartupMaintenance(createModeState(), logger);
  await flushMicrotasks();

  expect(cleanupDrafts).not.toHaveBeenCalled();
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
