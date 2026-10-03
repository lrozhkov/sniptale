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
  recoverAssetPublications: vi.fn(),
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
vi.mock('../../composition/persistence/asset-publication-recovery', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/asset-publication-recovery')
  >()),
  recoverAssetPublications: offscreenMocks.recoverAssetPublications,
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
  offscreenMocks.sendRuntimeMessage.mockReset().mockResolvedValue(undefined);
  offscreenMocks.subscribeToDbTermination.mockReset();
  offscreenMocks.reconcileProjectExportJobs.mockReset();
  offscreenMocks.recoverAssetPublications.mockReset();
  offscreenMocks.deleteAllFrameAnnotationRasterJobs.mockReset();
  offscreenMocks.reconcileRecordingCompletionOutbox.mockReset();
  offscreenMocks.initDB.mockResolvedValue(undefined);
  offscreenMocks.reconcileProjectExportJobs.mockResolvedValue(undefined);
  offscreenMocks.recoverAssetPublications.mockResolvedValue(0);
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

async function verifyReadinessProbeRejectsStaleStartupIdentity() {
  const { bootstrapOffscreenDocument, probeOffscreenRuntimeReadiness } =
    await import('./bootstrap');
  bootstrapOffscreenDocument();

  await expect(
    probeOffscreenRuntimeReadiness({
      challenge: 'challenge-stale',
      offscreenStartupId: 'startup-stale',
    })
  ).resolves.toEqual({
    challenge: 'challenge-stale',
    offscreenStartupId: 'startup-1',
    state: 'failed',
  });
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
  expect(offscreenMocks.recoverAssetPublications).not.toHaveBeenCalled();
  expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'OFFSCREEN_READY',
    offscreenStartupId: 'privacy-1',
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

  it('sends OFFSCREEN_READY with the current startup id', verifyReadyMessageIncludesStartupId);
  it(
    'rejects a readiness probe for a stale startup identity',
    verifyReadinessProbeRejectsStaleStartupIdentity
  );
  it(
    'keeps the privacy-erasure offscreen document free of persistence bootstrap writes',
    verifyPrivacyErasureBootstrapSkipsPersistenceInitialization
  );
});

it('announces transport readiness without opening or recovering storage', async () => {
  vi.resetModules();
  resetOffscreenMocks();
  vi.stubGlobal('location', {
    href: 'chrome-extension://id/offscreen.html?offscreenStartupId=current',
  });
  offscreenMocks.initDB.mockImplementation(() => new Promise(() => undefined));
  const { bootstrapOffscreenDocument, probeOffscreenRuntimeReadiness } =
    await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();
  expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'OFFSCREEN_READY',
    offscreenStartupId: 'current',
  });
  expect(offscreenMocks.initDB).not.toHaveBeenCalled();
  expect(offscreenMocks.deleteAllFrameAnnotationRasterJobs).not.toHaveBeenCalled();
  await expect(
    probeOffscreenRuntimeReadiness({ challenge: 'probe', offscreenStartupId: 'current' })
  ).resolves.toMatchObject({ state: 'ready' });
});

it.each(['chrome-extension://id/offscreen.html', 'invalid-url'])(
  'refuses to announce a document without startup identity: %s',
  async (href) => {
    vi.resetModules();
    resetOffscreenMocks();
    vi.stubGlobal('location', { href });
    const { bootstrapOffscreenDocument, probeOffscreenRuntimeReadiness } =
      await import('./bootstrap');
    bootstrapOffscreenDocument();
    expect(offscreenMocks.sendRuntimeMessage).not.toHaveBeenCalled();
    await expect(
      probeOffscreenRuntimeReadiness({ challenge: 'x', offscreenStartupId: 'x' })
    ).resolves.toMatchObject({ state: 'failed' });
  }
);
it('keeps a probe usable when readiness notification fails', async () => {
  vi.resetModules();
  resetOffscreenMocks();
  vi.stubGlobal('location', {
    href: 'chrome-extension://id/offscreen.html?offscreenStartupId=current',
  });
  offscreenMocks.sendRuntimeMessage.mockRejectedValueOnce(new Error('transport'));
  const { bootstrapOffscreenDocument, probeOffscreenRuntimeReadiness } =
    await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();
  expect(offscreenMocks.logger.warn).toHaveBeenCalledWith(
    'Failed to notify runtime about offscreen readiness'
  );
  await expect(
    probeOffscreenRuntimeReadiness({ challenge: 'x', offscreenStartupId: 'current' })
  ).resolves.toMatchObject({ state: 'ready' });
});
