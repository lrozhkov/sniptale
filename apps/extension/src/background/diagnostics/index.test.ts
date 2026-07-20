import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const {
  buildDiagnosticMeta,
  cleanupDiagnosticsSession,
  createDiagnosticsSession,
  diagnosticsLogger,
  enableDiagnosticsForSession,
  finalizeSessionMeta,
  getDiagnosticsSession,
  hasActiveDiagnosticsSession,
  notifyDiagnosticLogger,
  persistDiagnosticsSession,
  registerDiagnosticsSession,
  resolveTabUrl,
  restoreOrGetSession,
  shutDownDiagnosticsSession,
  startDiagnosticsFlushLoop,
} = vi.hoisted(() => ({
  buildDiagnosticMeta: vi.fn(),
  cleanupDiagnosticsSession: vi.fn(),
  createDiagnosticsSession: vi.fn(),
  diagnosticsLogger: {
    debug: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
  enableDiagnosticsForSession: vi.fn(),
  finalizeSessionMeta: vi.fn(),
  getDiagnosticsSession: vi.fn(),
  hasActiveDiagnosticsSession: vi.fn(),
  notifyDiagnosticLogger: vi.fn(),
  persistDiagnosticsSession: vi.fn(),
  registerDiagnosticsSession: vi.fn(),
  resolveTabUrl: vi.fn(),
  restoreOrGetSession: vi.fn(),
  shutDownDiagnosticsSession: vi.fn(),
  startDiagnosticsFlushLoop: vi.fn(),
}));

vi.mock('./logger', () => ({
  diagnosticsLogger,
}));

vi.mock('./state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state')>()),
  getDiagnosticsSession,
  hasActiveDiagnosticsSession,
  registerDiagnosticsSession,
  startDiagnosticsFlushLoop,
}));

vi.mock('./session', () => ({
  buildDiagnosticMeta,
  cleanupDiagnosticsSession,
  createDiagnosticsSession,
  finalizeSessionMeta,
  persistDiagnosticsSession,
}));

vi.mock('./runtime', () => ({
  enableDiagnosticsForSession,
  notifyDiagnosticLogger,
  resolveTabUrl,
  restoreOrGetSession,
  shutDownDiagnosticsSession,
}));

import { reserveDiagnosticsErasureExclusion } from './lifecycle-gate';
import { pauseDiagnosticsCollection, startDiagnostics, stopDiagnostics } from '.';

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
  hasActiveDiagnosticsSession.mockReturnValue(false);
  resolveTabUrl.mockResolvedValue('https://example.com');
  buildDiagnosticMeta.mockReturnValue({ meta: true });
  createDiagnosticsSession.mockReturnValue(createSession());
  enableDiagnosticsForSession.mockResolvedValue(undefined);
  notifyDiagnosticLogger.mockResolvedValue(undefined);
  restoreOrGetSession.mockResolvedValue(null);
  cleanupDiagnosticsSession.mockResolvedValue(undefined);
  persistDiagnosticsSession.mockResolvedValue(true);
  shutDownDiagnosticsSession.mockResolvedValue(undefined);
});

it('starts diagnostics by wiring runtime, state, and session seams together', async () => {
  const session = createSession();
  createDiagnosticsSession.mockReturnValue(session);

  await startDiagnostics('recording-1', 7, { width: 1280, height: 720 });

  expect(diagnosticsLogger.log).toHaveBeenCalledWith('Starting diagnostics collection', {
    recordingId: 'recording-1',
    tabId: 7,
  });
  expect(resolveTabUrl).toHaveBeenCalledWith(7);
  expect(buildDiagnosticMeta).toHaveBeenCalledWith('https://example.com', {
    width: 1280,
    height: 720,
  });
  expect(createDiagnosticsSession).toHaveBeenCalledWith('recording-1', 7, { meta: true });
  expect(registerDiagnosticsSession).toHaveBeenCalledWith(session);
  expect(enableDiagnosticsForSession).toHaveBeenCalledWith(7, 'recording-1');
  expect(startDiagnosticsFlushLoop).toHaveBeenCalledOnce();
  expect(notifyDiagnosticLogger).toHaveBeenCalledWith(
    7,
    VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER,
    'recording-1'
  );
});

it('skips duplicate diagnostics starts and only pauses existing sessions', async () => {
  hasActiveDiagnosticsSession.mockReturnValue(true);

  await startDiagnostics('recording-1', 7, { width: 1280, height: 720 });

  expect(diagnosticsLogger.warn).toHaveBeenCalledWith('Diagnostics session already exists', {
    recordingId: 'recording-1',
  });
  expect(resolveTabUrl).not.toHaveBeenCalled();

  const session = createSession();
  getDiagnosticsSession.mockReturnValueOnce(session);
  pauseDiagnosticsCollection('recording-1');
  expect(session.isPaused).toBe(true);
  expect(diagnosticsLogger.debug).toHaveBeenCalledWith('Paused diagnostics collection', {
    recordingId: 'recording-1',
  });

  getDiagnosticsSession.mockReturnValueOnce(undefined);
  pauseDiagnosticsCollection('missing-recording');
  expect(diagnosticsLogger.debug).toHaveBeenCalledTimes(1);
});

it('warns when stop is requested without a recoverable session', async () => {
  await stopDiagnostics('missing-recording');

  expect(diagnosticsLogger.log).toHaveBeenCalledWith('Stopping diagnostics collection', {
    recordingId: 'missing-recording',
  });
  expect(diagnosticsLogger.warn).toHaveBeenCalledWith('No diagnostics session found during stop', {
    recordingId: 'missing-recording',
  });
  expect(finalizeSessionMeta).not.toHaveBeenCalled();
});

it('finalizes, persists, shuts down, and cleans up a recovered session', async () => {
  const session = createSession();
  restoreOrGetSession.mockResolvedValue(session);

  await stopDiagnostics('recording-1');

  expect(finalizeSessionMeta).toHaveBeenCalledWith(session);
  expect(persistDiagnosticsSession).toHaveBeenCalledWith(session, 'recording-1');
  expect(shutDownDiagnosticsSession).toHaveBeenCalledWith(session);
  expect(cleanupDiagnosticsSession).toHaveBeenCalledWith('recording-1', session);
  expect(diagnosticsLogger.debug).toHaveBeenCalledWith('Stopped diagnostics collection', {
    recordingId: 'recording-1',
  });
});

it('keeps the diagnostics session intact when persistence fails during stop', async () => {
  const session = createSession();
  restoreOrGetSession.mockResolvedValue(session);
  persistDiagnosticsSession.mockResolvedValue(false);

  await expect(stopDiagnostics('recording-1')).rejects.toThrow(
    'Failed to persist diagnostics session recording-1'
  );

  expect(shutDownDiagnosticsSession).not.toHaveBeenCalled();
  expect(cleanupDiagnosticsSession).not.toHaveBeenCalled();
});

it('drains admitted finalization and rejects a late writer during erasure', async () => {
  const session = createSession();
  let resolvePersistence!: (saved: boolean) => void;
  restoreOrGetSession.mockResolvedValue(session);
  persistDiagnosticsSession.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        resolvePersistence = resolve;
      })
  );

  const finalization = stopDiagnostics('recording-1');
  await vi.waitFor(() => expect(persistDiagnosticsSession).toHaveBeenCalledOnce());
  const exclusion = reserveDiagnosticsErasureExclusion();
  let drained = false;
  void exclusion.waitForActiveMutations().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);

  await stopDiagnostics('late-recording');
  await startDiagnostics('late-start', 9, { height: 720, width: 1280 });
  expect(restoreOrGetSession).toHaveBeenCalledOnce();
  expect(diagnosticsLogger.warn).toHaveBeenCalledWith(
    'Diagnostics stop persistence rejected during local data erasure'
  );
  expect(diagnosticsLogger.warn).toHaveBeenCalledWith(
    'Diagnostics start rejected during local data erasure'
  );
  expect(JSON.stringify(diagnosticsLogger.warn.mock.calls)).not.toContain('late-');
  resolvePersistence(true);
  await finalization;
  await exclusion.waitForActiveMutations();
  exclusion.release();
});
