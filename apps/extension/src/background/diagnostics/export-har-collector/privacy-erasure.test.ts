import { beforeEach, expect, it, vi } from 'vitest';

const sendCommand = vi.hoisted(() => vi.fn());
const detachDebuggerForPrivacyErasure = vi.hoisted(() => vi.fn());
const listAttachedDebuggerClientOwners = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger: { sendCommand },
}));
vi.mock('../../debugger/session/detach.privacy-erasure', () => ({
  detachDebuggerForPrivacyErasure,
}));
vi.mock('../../debugger/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../debugger/session')>()),
  listAttachedDebuggerClientOwners,
}));

import { quiesceExportHarSessionsForPrivacyErasure } from './privacy-erasure';
import { createExportHarSession } from './session-factory';
import {
  clearExportHarSession,
  listExportHarSessions,
  registerExportHarSession,
} from './session-state';

function seedSession(sessionId: string, tabId: number): void {
  registerExportHarSession(
    createExportHarSession({
      browserName: 'Chrome',
      browserVersion: '123',
      pageUrl: 'https://example.test',
      rawDiagnosticsEnabled: false,
      sessionId,
      tabId,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const session of listExportHarSessions()) {
    clearExportHarSession(session.sessionId);
  }
  sendCommand.mockResolvedValue(undefined);
  detachDebuggerForPrivacyErasure.mockResolvedValue(undefined);
  listAttachedDebuggerClientOwners.mockReturnValue([]);
});

it('strictly disables capture and detaches every active HAR session', async () => {
  seedSession('first', 27);
  seedSession('second', 28);

  await quiesceExportHarSessionsForPrivacyErasure();

  expect(sendCommand).toHaveBeenNthCalledWith(1, { tabId: 27 }, 'Network.disable');
  expect(sendCommand).toHaveBeenNthCalledWith(2, { tabId: 28 }, 'Network.disable');
  expect(detachDebuggerForPrivacyErasure).toHaveBeenCalledTimes(2);
  expect(listExportHarSessions()).toEqual([]);
});

it('retains ownership for retry when strict network or detach shutdown fails', async () => {
  seedSession('network-retry', 29);
  sendCommand.mockRejectedValueOnce(new Error('network disable failed'));
  await expect(quiesceExportHarSessionsForPrivacyErasure()).rejects.toThrow(
    'network disable failed'
  );
  expect(detachDebuggerForPrivacyErasure).not.toHaveBeenCalled();

  sendCommand.mockResolvedValue(undefined);
  detachDebuggerForPrivacyErasure.mockRejectedValueOnce(new Error('strict detach failed'));
  await expect(quiesceExportHarSessionsForPrivacyErasure()).rejects.toThrow('strict detach failed');
  expect(listExportHarSessions()).toHaveLength(1);

  detachDebuggerForPrivacyErasure.mockResolvedValue(undefined);
  await expect(quiesceExportHarSessionsForPrivacyErasure()).resolves.toBeUndefined();
});

it('fails verification if a session appears while cleanup is running', async () => {
  seedSession('initial', 30);
  detachDebuggerForPrivacyErasure.mockImplementationOnce(async () => {
    seedSession('late', 31);
  });

  await expect(quiesceExportHarSessionsForPrivacyErasure()).rejects.toThrow(
    'HAR session cleanup verification failed'
  );
  expect(listExportHarSessions().map((session) => session.sessionId)).toEqual(['late']);
});

it('enumerates an orphaned HAR debugger owner and retries strict detach', async () => {
  const owner = { tabId: 32, clients: ['export-har'], targetId: 'target-32' };
  listAttachedDebuggerClientOwners
    .mockReturnValueOnce([owner])
    .mockReturnValueOnce([owner])
    .mockReturnValue([]);
  detachDebuggerForPrivacyErasure.mockRejectedValueOnce(new Error('strict detach failed'));

  await expect(quiesceExportHarSessionsForPrivacyErasure()).rejects.toThrow('strict detach failed');
  await expect(quiesceExportHarSessionsForPrivacyErasure()).resolves.toBeUndefined();
  expect(sendCommand).toHaveBeenCalledWith({ tabId: 32 }, 'Network.disable');
});
