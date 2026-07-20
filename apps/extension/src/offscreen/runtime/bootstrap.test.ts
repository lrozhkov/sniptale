import { beforeEach, describe, expect, it, vi } from 'vitest';

const offscreenMocks = vi.hoisted(() => ({
  getCurrentLocale: vi.fn(() => 'en'),
  initDB: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  sendRuntimeMessage: vi.fn(),
  subscribeToDbTermination: vi.fn(),
  reconcileProjectExportJobs: vi.fn(),
  translate: vi.fn((key: string) => key),
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

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  getCurrentLocale: offscreenMocks.getCurrentLocale,
  translate: offscreenMocks.translate,
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

function resetOffscreenMocks() {
  offscreenMocks.getCurrentLocale.mockClear();
  offscreenMocks.initDB.mockReset();
  offscreenMocks.logger.debug.mockReset();
  offscreenMocks.logger.error.mockReset();
  offscreenMocks.logger.warn.mockReset();
  offscreenMocks.sendRuntimeMessage.mockReset();
  offscreenMocks.subscribeToDbTermination.mockReset();
  offscreenMocks.reconcileProjectExportJobs.mockReset();
  offscreenMocks.translate.mockClear();
  offscreenMocks.initDB.mockResolvedValue(undefined);
  offscreenMocks.reconcileProjectExportJobs.mockResolvedValue(undefined);
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
  await flushBootstrapTasks();

  expect(offscreenMocks.initDB).toHaveBeenCalledTimes(1);
  expect(offscreenMocks.subscribeToDbTermination).toHaveBeenCalledTimes(1);

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

async function verifyLocaleMetadataBootstrap() {
  const statusText = { textContent: '' };
  vi.stubGlobal('document', {
    documentElement: { lang: 'ru' },
    getElementById: vi.fn(() => statusText),
    title: 'initial',
  });

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();

  expect(offscreenMocks.getCurrentLocale).toHaveBeenCalledTimes(1);
  expect(offscreenMocks.translate).toHaveBeenCalledWith(
    'background.runtime.offscreenDocumentTitle',
    'en'
  );
  expect(offscreenMocks.translate).toHaveBeenCalledWith('popup.labels.statusReady', 'en');
  expect((document as { documentElement: { lang: string } }).documentElement.lang).toBe('en');
  expect((document as { title: string }).title).toBe('background.runtime.offscreenDocumentTitle');
  expect(statusText.textContent).toBe('popup.labels.statusReady');
}

async function verifyBootstrapWithoutStatusTextNode() {
  vi.stubGlobal('document', {
    documentElement: { lang: 'ru' },
    getElementById: vi.fn(() => null),
    title: 'initial',
  });

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();

  expect((document as { documentElement: { lang: string } }).documentElement.lang).toBe('en');
  expect((document as { title: string }).title).toBe('background.runtime.offscreenDocumentTitle');
}

async function verifyBootstrapWithoutDocumentGlobals() {
  vi.unstubAllGlobals();

  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();

  expect(offscreenMocks.getCurrentLocale).not.toHaveBeenCalled();
}

async function verifyReadyMessageIncludesStartupId() {
  const { bootstrapOffscreenDocument } = await import('./bootstrap');
  bootstrapOffscreenDocument();
  await flushBootstrapTasks();

  expect(offscreenMocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'OFFSCREEN_READY',
    offscreenStartupId: 'startup-1',
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
  it(
    'skips locale metadata updates when document globals are unavailable',
    verifyBootstrapWithoutDocumentGlobals
  );
  it(
    'updates document metadata even when the status text node is missing',
    verifyBootstrapWithoutStatusTextNode
  );
  it(
    'applies locale-aware offscreen document metadata when document globals exist',
    verifyLocaleMetadataBootstrap
  );
  it('sends OFFSCREEN_READY with the current startup id', verifyReadyMessageIncludesStartupId);
  it(
    'keeps the privacy-erasure offscreen document free of persistence bootstrap writes',
    verifyPrivacyErasureBootstrapSkipsPersistenceInitialization
  );
  it(
    'reports bootstrap failures instead of sending OFFSCREEN_READY',
    verifyBootstrapFailureReporting
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
