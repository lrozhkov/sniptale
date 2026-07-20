import { beforeEach, expect, it, vi } from 'vitest';

const sendCommand = vi.hoisted(() => vi.fn());
const detachDebugger = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger: { sendCommand },
}));
vi.mock('../../debugger/session/detach', () => ({ detachDebugger }));

import { clearExpiredExportHarSession, handleExportHarNavigationStart } from './session-lifecycle';
import { createExportHarSession } from './session-factory';
import {
  clearExportHarSession,
  listExportHarSessions,
  registerExportHarSession,
} from './session-state';

beforeEach(() => {
  vi.clearAllMocks();
  for (const session of listExportHarSessions()) {
    clearExportHarSession(session.sessionId);
  }
  sendCommand.mockResolvedValue(undefined);
  detachDebugger.mockResolvedValue(undefined);
});

it('handles navigation with and without an owned HAR session', async () => {
  await expect(handleExportHarNavigationStart(34)).resolves.toBeUndefined();
  const session = createExportHarSession({
    browserName: 'Chrome',
    browserVersion: '123',
    pageUrl: 'https://example.test',
    rawDiagnosticsEnabled: false,
    sessionId: 'navigation',
    tabId: 34,
  });
  registerExportHarSession(session);

  await handleExportHarNavigationStart(34);

  expect(sendCommand).toHaveBeenCalledWith({ tabId: 34 }, 'Network.disable');
  expect(detachDebugger).toHaveBeenCalledWith(34, 'export-har');
  expect(listExportHarSessions()).toEqual([]);
});

it('strictly clears an expired HAR session before a new start slot is admitted', async () => {
  const session = createExportHarSession({
    browserName: 'Chrome',
    browserVersion: '123',
    pageUrl: 'https://example.test',
    rawDiagnosticsEnabled: false,
    sessionId: 'expired',
    tabId: 33,
  });
  session.expiresAtEpochMs = 0;

  await clearExpiredExportHarSession(session);

  expect(sendCommand).toHaveBeenCalledWith({ tabId: 33 }, 'Network.disable');
  expect(detachDebugger).toHaveBeenCalledWith(33, 'export-har');
});
