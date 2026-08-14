import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasActiveSessions: vi.fn(),
  listActiveSessions: vi.fn(),
  resetState: vi.fn(),
  shutdownSession: vi.fn(),
}));

vi.mock('../state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../state')>()),
  hasActiveDiagnosticsSessions: mocks.hasActiveSessions,
  listActiveDiagnosticsSessions: mocks.listActiveSessions,
  resetDiagnosticsStateForLocalDataErasure: mocks.resetState,
}));
vi.mock('../runtime.privacy-erasure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime.privacy-erasure')>()),
  shutDownDiagnosticsSessionForPrivacyErasure: mocks.shutdownSession,
}));

import { diagnosticsPrivacyErasureCleanupAdapter } from './cleanup';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasActiveSessions.mockReturnValue(false);
  mocks.listActiveSessions.mockReturnValue([]);
  mocks.resetState.mockResolvedValue(undefined);
  mocks.shutdownSession.mockResolvedValue(undefined);
});

it('strictly quiesces active interaction diagnostics before clearing owner state', async () => {
  const session = { recordingId: 'recording-1', tabId: 7 };
  mocks.listActiveSessions.mockReturnValue([session]);

  await expect(diagnosticsPrivacyErasureCleanupAdapter.cleanup()).resolves.toEqual([
    {
      id: 'diagnostics-runtime-state',
      remainingCount: 0,
      severity: 'required',
      status: 'verified-empty',
    },
  ]);

  expect(mocks.shutdownSession).toHaveBeenCalledWith(session);
  expect(mocks.shutdownSession).toHaveBeenCalledBefore(mocks.resetState);
});

it('retains retry ownership when strict diagnostics shutdown fails', async () => {
  mocks.listActiveSessions.mockReturnValue([{ recordingId: 'recording-1', tabId: 7 }]);
  mocks.shutdownSession.mockRejectedValueOnce(new Error('shutdown failed'));

  await expect(diagnosticsPrivacyErasureCleanupAdapter.cleanup()).rejects.toThrow(
    'shutdown failed'
  );
  expect(mocks.resetState).not.toHaveBeenCalled();
});

it('rejects a false verified-empty result after owner reset', async () => {
  mocks.hasActiveSessions.mockReturnValue(true);

  await expect(diagnosticsPrivacyErasureCleanupAdapter.cleanup()).rejects.toThrow(
    'Diagnostics cleanup verification failed'
  );
});
