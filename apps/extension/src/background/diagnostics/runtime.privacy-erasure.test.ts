import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const mocks = vi.hoisted(() => ({
  detach: vi.fn(),
  disableDomains: vi.fn(),
  hasAttachedClient: vi.fn(),
  listAttachedDebuggerClientOwners: vi.fn(),
  sendTabMessage: vi.fn(),
}));

vi.mock('../debugger/privacy-erasure', () => ({
  disableDiagnosticsDomainsForPrivacyErasure: mocks.disableDomains,
}));
vi.mock('../debugger/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../debugger/session')>()),
  hasAttachedClient: mocks.hasAttachedClient,
  listAttachedDebuggerClientOwners: mocks.listAttachedDebuggerClientOwners,
}));
vi.mock('../debugger/session/detach.privacy-erasure', () => ({
  detachDebuggerForPrivacyErasure: mocks.detach,
}));
vi.mock('../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendTabMessage: mocks.sendTabMessage }),
}));

import {
  quiesceOrphanedDiagnosticsDebuggerClientsForPrivacyErasure,
  shutDownDiagnosticsSessionForPrivacyErasure,
} from './runtime.privacy-erasure';

const session = {
  recordingId: 'recording-1',
  startedAt: 123,
  tabId: 7,
  meta: {
    recordingStartedAt: '2026-07-15T00:00:00.000Z',
    url: 'https://example.test',
    userAgent: 'Sniptale Test',
    viewportHeight: 720,
    viewportWidth: 1280,
  },
  events: [],
  pendingNetworkRequests: new Map(),
  isPaused: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.disableDomains.mockResolvedValue(undefined);
  mocks.detach.mockResolvedValue(undefined);
  mocks.sendTabMessage.mockResolvedValue(undefined);
  mocks.hasAttachedClient.mockReturnValue(false);
  mocks.listAttachedDebuggerClientOwners.mockReturnValue([]);
});

it('strictly shuts down debugger domains and content logging for privacy erasure', async () => {
  mocks.hasAttachedClient.mockReturnValueOnce(true).mockReturnValueOnce(false);

  await shutDownDiagnosticsSessionForPrivacyErasure(session);

  expect(mocks.disableDomains).toHaveBeenCalledWith(7);
  expect(mocks.detach).toHaveBeenCalledWith(7, 'diagnostics');
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(7, {
    type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
  });
});

it('surfaces strict detach and content-logger failures for retry', async () => {
  mocks.hasAttachedClient.mockReturnValue(true);
  mocks.detach.mockRejectedValueOnce(new Error('detach failed'));
  await expect(shutDownDiagnosticsSessionForPrivacyErasure(session)).rejects.toThrow(
    'detach failed'
  );
  expect(mocks.sendTabMessage).not.toHaveBeenCalled();

  vi.clearAllMocks();
  mocks.hasAttachedClient.mockReturnValueOnce(true).mockReturnValueOnce(false);
  mocks.sendTabMessage.mockRejectedValueOnce(new Error('logger unavailable'));
  await expect(shutDownDiagnosticsSessionForPrivacyErasure(session)).rejects.toThrow(
    'logger unavailable'
  );
});

it('skips debugger effects when no diagnostics client is attached', async () => {
  await shutDownDiagnosticsSessionForPrivacyErasure(session);

  expect(mocks.disableDomains).not.toHaveBeenCalled();
  expect(mocks.detach).not.toHaveBeenCalled();
  expect(mocks.sendTabMessage).toHaveBeenCalledOnce();
});

it('fails verification when debugger ownership remains after detach', async () => {
  mocks.hasAttachedClient.mockReturnValue(true);

  await expect(shutDownDiagnosticsSessionForPrivacyErasure(session)).rejects.toThrow(
    'Diagnostics debugger cleanup verification failed'
  );
});

it('enumerates orphaned diagnostics ownership and preserves it for a retry', async () => {
  const owner = { tabId: 9, clients: ['diagnostics'], targetId: 'target-9' };
  mocks.listAttachedDebuggerClientOwners
    .mockReturnValueOnce([owner])
    .mockReturnValueOnce([owner])
    .mockReturnValue([]);
  mocks.detach.mockRejectedValueOnce(new Error('detach failed'));

  await expect(quiesceOrphanedDiagnosticsDebuggerClientsForPrivacyErasure()).rejects.toThrow(
    'detach failed'
  );
  await expect(
    quiesceOrphanedDiagnosticsDebuggerClientsForPrivacyErasure()
  ).resolves.toBeUndefined();
  expect(mocks.disableDomains).toHaveBeenCalledWith(9);
  expect(mocks.detach).toHaveBeenCalledWith(9, 'diagnostics');
});
