import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sendCommand = vi.hoisted(() => vi.fn());
const detachDebugger = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger: { sendCommand },
}));
vi.mock('../../debugger/session/detach', () => ({ detachDebugger }));

import { scheduleExportHarSessionExpiry } from './session-expiry-orchestrator';
import { createExportHarSession } from './session-factory';
import {
  clearExportHarSession,
  getExportHarSession,
  registerExportHarSession,
} from './session-state';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  sendCommand.mockReset();
  sendCommand.mockResolvedValue(undefined);
  detachDebugger.mockReset();
  detachDebugger.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

it('detaches and clears the still-current session when its expiry timer fires', async () => {
  const session = createExportHarSession({
    browserName: 'Chrome',
    browserVersion: '123',
    pageUrl: 'https://example.test',
    rawDiagnosticsEnabled: false,
    sessionId: 'expiry-owner',
    tabId: 33,
  });
  session.expiresAtEpochMs = Date.now() + 100;
  registerExportHarSession(session, scheduleExportHarSessionExpiry(session));

  vi.advanceTimersByTime(100);
  await vi.runOnlyPendingTimersAsync();

  expect(sendCommand).toHaveBeenCalledWith({ tabId: 33 }, 'Network.disable');
  expect(detachDebugger).toHaveBeenCalledWith(33, 'export-har');
  expect(getExportHarSession(session.sessionId)).toBeUndefined();
});

it('does not detach a session that was cleared before the timer fires', async () => {
  const session = createExportHarSession({
    browserName: 'Chrome',
    browserVersion: '123',
    pageUrl: 'https://example.test',
    rawDiagnosticsEnabled: false,
    sessionId: 'expiry-cleared',
    tabId: 34,
  });
  session.expiresAtEpochMs = Date.now() + 100;
  scheduleExportHarSessionExpiry(session);
  clearExportHarSession(session.sessionId);

  vi.advanceTimersByTime(100);
  await vi.runOnlyPendingTimersAsync();

  expect(sendCommand).not.toHaveBeenCalled();
  expect(detachDebugger).not.toHaveBeenCalled();
});
