import { beforeEach, describe, expect, it, vi } from 'vitest';

const offscreenMocks = vi.hoisted(() => ({
  initDB: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  sendRuntimeMessage: vi.fn(),
  subscribeToDbTermination: vi.fn(),
  reconcileProjectExportJobs: vi.fn(),
  cleanupOrphanedRecordingStaging: vi.fn(),
  deleteAllFrameAnnotationRasterJobs: vi.fn(),
  reconcileRecordingCompletionOutbox: vi.fn(),
}));

vi.mock('../../composition/persistence/infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: offscreenMocks.initDB,
  subscribeToDbTermination: offscreenMocks.subscribeToDbTermination,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => offscreenMocks.logger,
}));

vi.mock('@sniptale/platform/observability/message-tracer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/message-tracer')>()),
  initTracer: vi.fn(),
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: offscreenMocks.sendRuntimeMessage,
}));

vi.mock('../project-export', () => ({
  cancelProjectExport: vi.fn(),
  getProjectExportCapabilities: vi.fn(),
  reconcileProjectExportJobs: offscreenMocks.reconcileProjectExportJobs,
  startProjectExport: vi.fn(),
}));
vi.mock('../../composition/persistence/recordings/staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/recordings/staging')>()),
  cleanupOrphanedRecordingStaging: offscreenMocks.cleanupOrphanedRecordingStaging,
}));
vi.mock('../../composition/persistence/frame-annotation-raster-jobs', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/frame-annotation-raster-jobs')
  >()),
  deleteAllFrameAnnotationRasterJobs: offscreenMocks.deleteAllFrameAnnotationRasterJobs,
}));
vi.mock('../recording/post-record-publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/post-record-publication')>()),
  reconcileRecordingCompletionOutbox: offscreenMocks.reconcileRecordingCompletionOutbox,
}));

function resetOffscreenMocks() {
  offscreenMocks.initDB.mockReset();
  offscreenMocks.logger.debug.mockReset();
  offscreenMocks.logger.error.mockReset();
  offscreenMocks.logger.warn.mockReset();
  offscreenMocks.sendRuntimeMessage.mockReset();
  offscreenMocks.subscribeToDbTermination.mockReset();
  offscreenMocks.reconcileProjectExportJobs.mockReset();
  offscreenMocks.cleanupOrphanedRecordingStaging.mockReset();
  offscreenMocks.deleteAllFrameAnnotationRasterJobs.mockReset();
  offscreenMocks.reconcileRecordingCompletionOutbox.mockReset();
  offscreenMocks.initDB.mockResolvedValue(undefined);
  offscreenMocks.reconcileProjectExportJobs.mockResolvedValue(undefined);
  offscreenMocks.cleanupOrphanedRecordingStaging.mockResolvedValue(0);
  offscreenMocks.deleteAllFrameAnnotationRasterJobs.mockResolvedValue(undefined);
  offscreenMocks.reconcileRecordingCompletionOutbox.mockResolvedValue(false);
}

async function flushBootstrapTasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function verifyTerminationReinitFlow() {
  offscreenMocks.subscribeToDbTermination.mockReturnValue(() => undefined);

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await vi.waitFor(() => {
    expect(offscreenMocks.subscribeToDbTermination).toHaveBeenCalledTimes(1);
    expect(offscreenMocks.deleteAllFrameAnnotationRasterJobs).toHaveBeenCalledOnce();
    expect(offscreenMocks.cleanupOrphanedRecordingStaging).toHaveBeenCalledOnce();
  });

  expect(offscreenMocks.initDB).toHaveBeenCalledTimes(1);
  expect(offscreenMocks.subscribeToDbTermination).toHaveBeenCalledTimes(1);
  expect(offscreenMocks.cleanupOrphanedRecordingStaging).toHaveBeenCalledOnce();
  expect(offscreenMocks.deleteAllFrameAnnotationRasterJobs).toHaveBeenCalledOnce();

  const handleTermination = offscreenMocks.subscribeToDbTermination.mock.calls[0]?.[0] as
    | (() => void)
    | undefined;
  if (!handleTermination) {
    throw new Error('Expected DB termination listener to be registered');
  }

  handleTermination();

  expect(offscreenMocks.logger.warn).toHaveBeenCalledWith(
    'DB connection terminated, reinitializing offscreen DB'
  );
  expect(offscreenMocks.initDB).toHaveBeenCalledTimes(2);
}

async function verifyReadyMessageIncludesStartupId() {
  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await vi.waitFor(() =>
    expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_READY',
      offscreenStartupId: 'startup-1',
    })
  );

  expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'OFFSCREEN_READY',
    offscreenStartupId: 'startup-1',
  });
}

async function verifyCompletionOutboxReplaysBeforeReady() {
  offscreenMocks.reconcileRecordingCompletionOutbox.mockResolvedValueOnce(true);

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await vi.waitFor(() => {
    expect(offscreenMocks.reconcileRecordingCompletionOutbox).toHaveBeenCalledOnce();
    expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_READY',
      offscreenStartupId: 'startup-1',
    });
  });

  expect(
    offscreenMocks.reconcileRecordingCompletionOutbox.mock.invocationCallOrder[0]
  ).toBeLessThan(offscreenMocks.sendRuntimeMessage.mock.invocationCallOrder[0]!);
}

async function verifyPrivacyErasureBootstrapSkipsPersistenceInitialization() {
  const privacyErasureDocumentUrl =
    'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?' +
    'offscreenStartupId=privacy-1&privacyErasure=1';
  vi.stubGlobal('location', { href: privacyErasureDocumentUrl });

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();

  expect(offscreenMocks.initDB).not.toHaveBeenCalled();
  expect(offscreenMocks.reconcileProjectExportJobs).not.toHaveBeenCalled();
  expect(offscreenMocks.cleanupOrphanedRecordingStaging).not.toHaveBeenCalled();
  expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'OFFSCREEN_READY',
    offscreenStartupId: 'privacy-1',
  });
}

async function verifyBootstrapFailureReporting() {
  offscreenMocks.initDB.mockRejectedValueOnce(new Error('db unavailable'));

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();

  expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'OFFSCREEN_ERROR',
    error: 'db unavailable',
    offscreenStartupId: 'startup-1',
    phase: 'runtime',
  });
}

async function verifyOrphanCleanupFailureBlocksReady() {
  offscreenMocks.cleanupOrphanedRecordingStaging.mockRejectedValueOnce(
    new Error('staging cleanup unavailable')
  );

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await vi.waitFor(() =>
    expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_ERROR',
      error: 'staging cleanup unavailable',
      offscreenStartupId: 'startup-1',
      phase: 'runtime',
    })
  );

  expect(offscreenMocks.reconcileProjectExportJobs).not.toHaveBeenCalled();
}

async function verifyCompletionReplayFailureBlocksReady() {
  offscreenMocks.reconcileRecordingCompletionOutbox.mockRejectedValueOnce(
    new Error('completion replay unavailable')
  );

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await vi.waitFor(() =>
    expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'OFFSCREEN_ERROR',
      error: 'completion replay unavailable',
      offscreenStartupId: 'startup-1',
      phase: 'runtime',
    })
  );
  expect(offscreenMocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'OFFSCREEN_READY' })
  );
}

async function verifyBootstrapFailureNotificationFallback() {
  offscreenMocks.initDB.mockRejectedValueOnce(new Error('db unavailable'));
  offscreenMocks.sendRuntimeMessage.mockRejectedValueOnce(new Error('transport unavailable'));

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();

  expect(offscreenMocks.logger.error).toHaveBeenLastCalledWith(
    'Failed to notify runtime about offscreen bootstrap failure',
    expect.any(Error)
  );
}

async function verifyTerminationReinitFailureReporting() {
  offscreenMocks.subscribeToDbTermination.mockReturnValue(() => undefined);

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();

  offscreenMocks.initDB.mockRejectedValueOnce(new Error('db unavailable again'));
  const handleTermination = offscreenMocks.subscribeToDbTermination.mock.calls[0]?.[0] as
    | (() => void)
    | undefined;
  if (!handleTermination) {
    throw new Error('Expected DB termination listener to be registered');
  }

  handleTermination();
  await flushBootstrapTasks();

  expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'OFFSCREEN_ERROR',
    error: 'db unavailable again',
    offscreenStartupId: 'startup-1',
    phase: 'runtime',
  });
}

describe('offscreen bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('location', {
      href: 'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=startup-1',
    });
    resetOffscreenMocks();
  });

  it(
    'subscribes to db termination and retries initialization after termination',
    verifyTerminationReinitFlow
  );
  it('sends OFFSCREEN_READY with the current startup id', verifyReadyMessageIncludesStartupId);
  it(
    'replays a durable recording completion before OFFSCREEN_READY',
    verifyCompletionOutboxReplaysBeforeReady
  );
  it(
    'keeps the privacy-erasure offscreen document free of persistence bootstrap writes',
    verifyPrivacyErasureBootstrapSkipsPersistenceInitialization
  );
  it(
    'reports bootstrap failures instead of sending OFFSCREEN_READY',
    verifyBootstrapFailureReporting
  );
  it(
    'blocks readiness when orphan staging cannot be reconciled',
    verifyOrphanCleanupFailureBlocksReady
  );
  it(
    'blocks readiness when a durable recording completion cannot be replayed',
    verifyCompletionReplayFailureBlocksReady
  );
  it(
    'logs when bootstrap failure notifications cannot be delivered',
    verifyBootstrapFailureNotificationFallback
  );
  it(
    'reports reinitialization failures after DB termination',
    verifyTerminationReinitFailureReporting
  );
});
