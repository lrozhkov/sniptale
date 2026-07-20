import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasActiveSessions: vi.fn(),
  invalidateHarStartAuthority: vi.fn(),
  listActiveSessions: vi.fn(),
  quiesceHarSessions: vi.fn(),
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
vi.mock('../export-har-collector/privacy-erasure', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../export-har-collector/privacy-erasure')>()),
  quiesceExportHarSessionsForPrivacyErasure: mocks.quiesceHarSessions,
}));
vi.mock('../export-har-collector/start-capability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../export-har-collector/start-capability')>()),
  invalidateExportHarStartAuthorityForPrivacyErasure: mocks.invalidateHarStartAuthority,
}));

import { diagnosticsPrivacyErasureCleanupAdapter } from './cleanup';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasActiveSessions.mockReturnValue(false);
  mocks.listActiveSessions.mockReturnValue([]);
  mocks.quiesceHarSessions.mockResolvedValue(undefined);
  mocks.resetState.mockResolvedValue(undefined);
  mocks.shutdownSession.mockResolvedValue(undefined);
});

it('strictly quiesces active diagnostics and HAR before clearing owner state', async () => {
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

  expect(mocks.invalidateHarStartAuthority).toHaveBeenCalledOnce();
  expect(mocks.shutdownSession).toHaveBeenCalledWith(session);
  expect(mocks.quiesceHarSessions).toHaveBeenCalledOnce();
  expect(mocks.shutdownSession).toHaveBeenCalledBefore(mocks.resetState);
  expect(mocks.quiesceHarSessions).toHaveBeenCalledBefore(mocks.resetState);
});

it('retains retry ownership when strict diagnostics shutdown fails', async () => {
  mocks.listActiveSessions.mockReturnValue([{ recordingId: 'recording-1', tabId: 7 }]);
  mocks.shutdownSession.mockRejectedValueOnce(new Error('detach failed'));

  await expect(diagnosticsPrivacyErasureCleanupAdapter.cleanup()).rejects.toThrow('detach failed');
  expect(mocks.quiesceHarSessions).not.toHaveBeenCalled();
  expect(mocks.resetState).not.toHaveBeenCalled();
});

it('does not clear diagnostics ownership when HAR quiescence fails', async () => {
  mocks.quiesceHarSessions.mockRejectedValueOnce(new Error('har detach failed'));

  await expect(diagnosticsPrivacyErasureCleanupAdapter.cleanup()).rejects.toThrow(
    'har detach failed'
  );
  expect(mocks.resetState).not.toHaveBeenCalled();
});

it('rejects a false verified-empty result after owner reset', async () => {
  mocks.hasActiveSessions.mockReturnValue(true);

  await expect(diagnosticsPrivacyErasureCleanupAdapter.cleanup()).rejects.toThrow(
    'Diagnostics cleanup verification failed'
  );
});
