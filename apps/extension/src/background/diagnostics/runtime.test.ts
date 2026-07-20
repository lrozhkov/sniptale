import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const {
  attachDebugger,
  attachDebuggerSafe,
  browserTabs,
  detachDebugger,
  detachDebuggerForPrivacyErasure,
  diagnosticsLogger,
  disableDiagnosticsDomains,
  disableDiagnosticsDomainsForPrivacyErasure,
  enableDiagnosticsDomains,
  clearDiagnosticsSessionFromStorage,
  clearStoredDiagnosticSnapshots,
  createRuntimeMessagingTransport,
  getActiveRecordingId,
  getDiagnosticsSession,
  getDiagnosticsSessionByTabId,
  getErrorMessage,
  hasActiveDiagnosticsSession,
  hasActiveDiagnosticsSessions,
  hasAttachedClient,
  maybeFlushDiagnosticsSession,
  readStoredDiagnosticSnapshots,
  registerDiagnosticsSession,
  replaceStoredDiagnosticSnapshots,
  restoreStoredDiagnosticsSession,
  RuntimeMessagingDeps,
  RuntimeMessagingTransport,
  saveActiveDiagnosticsSessionsToStorage,
  sendRuntimeMessage,
  sendTabMessage,
  startDiagnosticsFlushLoop,
  stopDiagnosticsFlushLoop,
  unregisterDiagnosticsSession,
} = vi.hoisted(() => ({
  attachDebugger: vi.fn(),
  attachDebuggerSafe: vi.fn(),
  browserTabs: { get: vi.fn() },
  clearDiagnosticsSessionFromStorage: vi.fn(),
  clearStoredDiagnosticSnapshots: vi.fn(),
  createRuntimeMessagingTransport: vi.fn(),
  detachDebugger: vi.fn(),
  detachDebuggerForPrivacyErasure: vi.fn(),
  diagnosticsLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  disableDiagnosticsDomains: vi.fn(),
  disableDiagnosticsDomainsForPrivacyErasure: vi.fn(),
  enableDiagnosticsDomains: vi.fn(),
  getActiveRecordingId: vi.fn(),
  getDiagnosticsSession: vi.fn(),
  getDiagnosticsSessionByTabId: vi.fn(),
  getErrorMessage: vi.fn(),
  hasActiveDiagnosticsSession: vi.fn(),
  hasActiveDiagnosticsSessions: vi.fn(),
  hasAttachedClient: vi.fn(),
  maybeFlushDiagnosticsSession: vi.fn(),
  readStoredDiagnosticSnapshots: vi.fn(),
  registerDiagnosticsSession: vi.fn(),
  replaceStoredDiagnosticSnapshots: vi.fn(),
  restoreStoredDiagnosticsSession: vi.fn(),
  RuntimeMessagingDeps: undefined,
  RuntimeMessagingTransport: undefined,
  saveActiveDiagnosticsSessionsToStorage: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  sendTabMessage: vi.fn(),
  startDiagnosticsFlushLoop: vi.fn(),
  stopDiagnosticsFlushLoop: vi.fn(),
  unregisterDiagnosticsSession: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs,
}));

vi.mock('../../platform/runtime-messaging/index', () => ({
  RuntimeMessagingDeps,
  RuntimeMessagingTransport,
  createRuntimeMessagingTransport,
  getErrorMessage,
  sendRuntimeMessage,
  sendTabMessage,
}));

vi.mock('../debugger/session/attach', () => ({
  attachDebugger,
  attachDebuggerSafe,
}));

vi.mock('../debugger/session/detach', () => ({
  detachDebugger,
}));
vi.mock('../debugger/session/detach.privacy-erasure', () => ({
  detachDebuggerForPrivacyErasure,
}));
vi.mock('../debugger/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../debugger/session')>()),
  hasAttachedClient,
}));
vi.mock('../debugger/diagnostics', () => ({
  disableDiagnosticsDomains,
  enableDiagnosticsDomains,
}));
vi.mock('../debugger/privacy-erasure', () => ({
  disableDiagnosticsDomainsForPrivacyErasure,
}));

vi.mock('./state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state')>()),
  getActiveRecordingId,
  getDiagnosticsSession,
  getDiagnosticsSessionByTabId,
  hasActiveDiagnosticsSession,
  hasActiveDiagnosticsSessions,
  maybeFlushDiagnosticsSession,
  registerDiagnosticsSession,
  startDiagnosticsFlushLoop,
  stopDiagnosticsFlushLoop,
  unregisterDiagnosticsSession,
}));

vi.mock('./logger', () => ({
  diagnosticsLogger,
}));

vi.mock('../storage/diagnostics/active-sessions', () => ({
  clearDiagnosticsSessionFromStorage,
  clearStoredDiagnosticSnapshots,
  readStoredDiagnosticSnapshots,
  replaceStoredDiagnosticSnapshots,
  restoreStoredDiagnosticsSession,
  saveActiveDiagnosticsSessionsToStorage,
}));

import {
  enableDiagnosticsForSession,
  notifyDiagnosticLogger,
  resolveTabUrl,
  restoreOrGetSession,
  shutDownDiagnosticsSession,
} from './runtime';

function createSession() {
  return {
    recordingId: 'recording-1',
    tabId: 7,
    startedAt: 100,
    meta: {
      url: 'https://example.com',
      userAgent: 'Sniptale Test UA',
      viewportWidth: 1280,
      viewportHeight: 720,
      recordingStartedAt: '2026-03-21T12:00:00.000Z',
    },
    events: [],
    pendingNetworkRequests: new Map(),
    isPaused: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  browserTabs.get.mockResolvedValue({ url: 'https://example.com' });
  attachDebugger.mockResolvedValue(undefined);
  enableDiagnosticsDomains.mockResolvedValue(undefined);
  disableDiagnosticsDomains.mockResolvedValue(undefined);
  detachDebugger.mockResolvedValue(undefined);
  detachDebuggerForPrivacyErasure.mockResolvedValue(undefined);
  disableDiagnosticsDomainsForPrivacyErasure.mockResolvedValue(undefined);
  hasAttachedClient.mockReturnValue(false);
  sendTabMessage.mockResolvedValue(undefined);
  getDiagnosticsSession.mockReturnValue(undefined);
  restoreStoredDiagnosticsSession.mockResolvedValue(null);
});

it('resolves the tab URL and falls back to an empty string on failure', async () => {
  await expect(resolveTabUrl(7)).resolves.toBe('https://example.com');

  browserTabs.get.mockResolvedValueOnce({});
  await expect(resolveTabUrl(9)).resolves.toBe('');

  const tabError = new Error('tab missing');
  browserTabs.get.mockRejectedValueOnce(tabError);

  await expect(resolveTabUrl(8)).resolves.toBe('');
  expect(diagnosticsLogger.error).toHaveBeenCalledWith(
    'Failed to resolve diagnostics tab URL',
    tabError
  );
});

it('attaches diagnostics domains and unregisters the session when attach fails', async () => {
  await enableDiagnosticsForSession(7, 'recording-1');
  expect(attachDebugger).toHaveBeenCalledWith(
    7,
    'diagnostics',
    expect.objectContaining({ token: expect.any(String) })
  );
  expect(enableDiagnosticsDomains).toHaveBeenCalledWith(7);

  const attachError = new Error('attach failed');
  attachDebugger.mockRejectedValueOnce(attachError);

  await expect(enableDiagnosticsForSession(7, 'recording-1')).rejects.toThrow('attach failed');
  expect(unregisterDiagnosticsSession).toHaveBeenCalledWith('recording-1', 7);
});

it('unregisters the session when enabling diagnostics domains fails', async () => {
  const enableError = new Error('enable failed');
  enableDiagnosticsDomains.mockRejectedValueOnce(enableError);
  hasAttachedClient.mockReturnValue(true);
  detachDebuggerForPrivacyErasure.mockRejectedValueOnce(new Error('detach failed'));

  await expect(enableDiagnosticsForSession(7, 'recording-2')).rejects.toThrow('enable failed');
  expect(unregisterDiagnosticsSession).toHaveBeenCalledWith('recording-2', 7);
  expect(disableDiagnosticsDomainsForPrivacyErasure).toHaveBeenCalledWith(7);
  expect(detachDebuggerForPrivacyErasure).toHaveBeenCalledWith(7, 'diagnostics');
  expect(diagnosticsLogger.error).toHaveBeenCalledWith(
    'Failed to attach debugger for diagnostics session',
    enableError
  );
  expect(diagnosticsLogger.warn).toHaveBeenCalledWith(
    'Failed to detach diagnostics debugger after startup failure',
    expect.any(Error)
  );
});

it('warns instead of throwing when tab logger messaging fails', async () => {
  const messageError = new Error('tab closed');
  sendTabMessage.mockRejectedValueOnce(messageError);

  await expect(
    notifyDiagnosticLogger(7, VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER, 'recording-1')
  ).resolves.toBeUndefined();

  expect(diagnosticsLogger.warn).toHaveBeenCalledWith(
    'Failed to update content diagnostics logger state',
    expect.objectContaining({
      error: messageError,
      recordingId: 'recording-1',
      tabId: 7,
      type: VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER,
    })
  );
});

it('omits recordingId when disabling the content diagnostics logger', async () => {
  await expect(
    notifyDiagnosticLogger(7, VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER)
  ).resolves.toBeUndefined();

  expect(sendTabMessage).toHaveBeenCalledWith(7, {
    type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
  });
});

it('reuses active sessions or restores them from storage when needed', async () => {
  const activeSession = createSession();
  getDiagnosticsSession.mockReturnValueOnce(activeSession);

  await expect(restoreOrGetSession('recording-1')).resolves.toBe(activeSession);
  expect(restoreStoredDiagnosticsSession).not.toHaveBeenCalled();

  const restoredSession = createSession();
  getDiagnosticsSession.mockReturnValueOnce(undefined);
  restoreStoredDiagnosticsSession.mockResolvedValueOnce(restoredSession);

  await expect(restoreOrGetSession('recording-1')).resolves.toBe(restoredSession);
  expect(registerDiagnosticsSession).toHaveBeenCalledWith(restoredSession);
});

it('returns null when storage has no persisted diagnostics session', async () => {
  await expect(restoreOrGetSession('missing-recording')).resolves.toBeNull();
  expect(registerDiagnosticsSession).not.toHaveBeenCalled();
});

it('shuts down diagnostics sessions and still disables the content logger on detach failure', async () => {
  const session = createSession();
  const detachError = new Error('detach failed');

  await shutDownDiagnosticsSession(session);
  expect(disableDiagnosticsDomains).toHaveBeenCalledWith(7);
  expect(detachDebugger).toHaveBeenCalledWith(7, 'diagnostics');
  expect(sendTabMessage).toHaveBeenCalledWith(7, {
    type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
    recordingId: undefined,
  });

  detachDebugger.mockRejectedValueOnce(detachError);
  await shutDownDiagnosticsSession(session);
  expect(diagnosticsLogger.warn).toHaveBeenCalledWith(
    'Failed to detach debugger for diagnostics session shutdown',
    detachError
  );
});
