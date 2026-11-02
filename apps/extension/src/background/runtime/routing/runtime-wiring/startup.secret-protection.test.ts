import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSecretProtectionService } from '../../../../composition/persistence/secret-protection/service';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import type { AiStorageReadiness } from '../../../../composition/persistence/ai-settings/init';
import { runStartupMaintenance } from './startup';

const ports = vi.hoisted(() => ({
  readiness: vi.fn<() => Promise<AiStorageReadiness>>(),
  initialize: vi.fn<() => Promise<void>>(),
}));
vi.mock('../../../../composition/persistence/ai-settings/init', () => ({
  readAiStorageReadiness: ports.readiness,
  initializeAiStorageAccess: ports.initialize,
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  ensurePersistentStorage: async () => undefined,
}));
vi.mock('../../../../composition/persistence/library-lifecycle', () => ({
  cleanupDrafts: async () => undefined,
}));
vi.mock('../../../../composition/persistence/settings', () => ({
  loadSettings: async () => ({ localStoragePolicy: {} }),
  removeRetiredSynchronizedSettings: async () => undefined,
}));
vi.mock('../../../../composition/persistence/highlighter', () => ({
  migrateHighlighterSystemPresetCatalog: async () => undefined,
}));
vi.mock('../../../../composition/persistence/callout-presets', () => ({
  migrateCalloutSystemPresetCatalog: async () => undefined,
}));
vi.mock('../../../../composition/persistence/step-badge-presets', () => ({
  migrateStepBadgeSystemPresetCatalog: async () => undefined,
}));
vi.mock('../../../../composition/persistence/project-export-inputs', () => ({
  cleanupExpiredProjectExportInputs: async () => undefined,
}));
vi.mock('../../../capture/lifecycle', () => ({
  cleanupCapture: async () => undefined,
  reconcileCaptureJobDownloadOnStartup: async () => undefined,
  reconcileCaptureJobsOnStartup: async () => undefined,
}));
vi.mock('../../../diagnostics/lifecycle', () => ({
  recoverInterruptedSessions: async () => undefined,
}));
vi.mock('../../../storage/full-page-capture', () => ({
  clearRetiredFullPageCaptureLease: async () => undefined,
}));
vi.mock('../../../storage/diagnostics/active-sessions', () => ({
  clearRetiredDiagnosticSnapshots: async () => undefined,
}));
vi.mock('../../../capture/page-package/job/recovery', () => ({
  recoverInterruptedPagePackageJob: async () => undefined,
}));
vi.mock('../../../media/lifecycle', () => ({
  recoverVideoCaptureSurfaceOnStartup: async () => undefined,
  resetVideoRecordingRuntimeState: () => undefined,
}));
vi.mock('../../../page-access/service', () => ({
  ensureActivePageAccessRuntime: async () => undefined,
}));
vi.mock('../../../media/video/content-surface/camera-peer', () => ({
  recoverPendingVideoRecordingCameraPeerCleanup: async () => undefined,
}));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const service = createSecretProtectionService({
    participants: [],
    containSync: async () => undefined,
    revokeLeases: () => undefined,
  });
  const prepare = vi.spyOn(service, 'prepare').mockResolvedValue(undefined);
  const reset = vi.spyOn(service, 'resetParticipant').mockResolvedValue(undefined);
  const state = createBackgroundRuntimeState();
  state.secretProtection = service;
  const failed = deferred();
  const initialized = deferred();
  const logger = { log: vi.fn(), warn: vi.fn(() => failed.resolve()) };
  ports.initialize.mockImplementation(async () => {
    initialized.resolve();
  });
  return { state, prepare, reset, logger, failed, initialized };
}
beforeEach(() => {
  vi.clearAllMocks();
  ports.readiness.mockResolvedValue({
    isReady: true,
    resetPhase: null,
    requiresReset: false,
    version: 1,
  });
});
afterEach(() => vi.restoreAllMocks());
it('contains shared secrets before resetting only damaged AI storage and waits for its native ACK', async () => {
  const f = fixture();
  const prepared = deferred();
  const resetStarted = deferred();
  const resetDone = deferred();
  f.prepare.mockReturnValue(prepared.promise);
  ports.readiness.mockResolvedValue({
    isReady: false,
    resetPhase: 'pending',
    requiresReset: true,
    version: 0,
  });
  f.reset.mockImplementation(async () => {
    resetStarted.resolve();
    await resetDone.promise;
  });
  runStartupMaintenance(f.state, f.logger);
  expect(ports.readiness).not.toHaveBeenCalled();
  expect(ports.initialize).not.toHaveBeenCalled();
  prepared.resolve();
  await resetStarted.promise;
  expect(f.reset).toHaveBeenCalledExactlyOnceWith('ai');
  expect(ports.initialize).not.toHaveBeenCalled();
  resetDone.resolve();
  await f.initialized.promise;
  expect(ports.initialize).toHaveBeenCalledOnce();
  expect(f.logger.warn).not.toHaveBeenCalled();
});
it('keeps compatible AI storage and initializes only after shared protection readiness', async () => {
  const f = fixture();
  runStartupMaintenance(f.state, f.logger);
  await f.initialized.promise;
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(ports.readiness).toHaveBeenCalledOnce();
  expect(f.reset).not.toHaveBeenCalled();
  expect(f.logger.warn).not.toHaveBeenCalled();
});
it.each(['prepare', 'readiness', 'reset'] as const)(
  'refuses AI initialization after %s failure and recovers on retry',
  async (stage) => {
    const f = fixture();
    const error = new Error('Controlled startup refusal');
    if (stage === 'prepare') f.prepare.mockRejectedValueOnce(error);
    else if (stage === 'readiness') ports.readiness.mockRejectedValueOnce(error);
    else {
      ports.readiness.mockResolvedValueOnce({
        isReady: false,
        resetPhase: 'pending',
        requiresReset: true,
        version: 0,
      });
      f.reset.mockRejectedValueOnce(error);
    }
    runStartupMaintenance(f.state, f.logger);
    await f.failed.promise;
    expect(ports.initialize).not.toHaveBeenCalled();
    expect(f.logger.warn).toHaveBeenCalledExactlyOnceWith(
      'AI storage initialization failed (non-critical)',
      error
    );
    runStartupMaintenance(f.state, f.logger);
    await f.initialized.promise;
    expect(ports.initialize).toHaveBeenCalledOnce();
  }
);
