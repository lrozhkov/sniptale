import { beforeEach, expect, it, vi } from 'vitest';

const { browserDebugger, withTimeout } = vi.hoisted(() => ({
  browserDebugger: {
    getTargets: vi.fn(),
  },
  withTimeout: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger,
}));

vi.mock('../infra', () => ({
  keepServiceWorkerAlive: vi.fn(),
  withTimeout,
}));

import { isDebuggerAttached } from './status';
import {
  getDebuggerSessionSnapshotForTests,
  getAttachedClients,
  getTabIdByTargetId,
  handleForcefulDetach,
  resetDebuggerSessionStateForTests,
  seedDebuggerSessionStateForTests,
} from './index';

beforeEach(() => {
  vi.clearAllMocks();
  resetDebuggerSessionStateForTests();

  browserDebugger.getTargets.mockResolvedValue([]);
  withTimeout.mockImplementation((promise: Promise<unknown>) => promise);
});

it('uses in-memory client ownership when a specific client is requested', async () => {
  seedDebuggerSessionStateForTests(9, ['diagnostics']);

  await expect(isDebuggerAttached(9, 'diagnostics')).resolves.toBe(true);
  await expect(isDebuggerAttached(9, 'screenshot')).resolves.toBe(false);
  expect(browserDebugger.getTargets).not.toHaveBeenCalled();
});

it('checks chrome debugger targets when no specific client is provided', async () => {
  browserDebugger.getTargets.mockResolvedValue([
    { tabId: 4, attached: false },
    { tabId: 9, attached: true },
  ]);

  await expect(isDebuggerAttached(9)).resolves.toBe(true);

  expect(withTimeout).toHaveBeenCalledWith(
    expect.any(Promise),
    expect.any(Number),
    'debugger.getTargets'
  );
  expect(browserDebugger.getTargets).toHaveBeenCalledOnce();
});

it('returns false when debugger target lookup fails', async () => {
  withTimeout.mockRejectedValue(new Error('getTargets failed'));

  await expect(isDebuggerAttached(9)).resolves.toBe(false);
});

it('returns attached clients as a stable array snapshot', () => {
  seedDebuggerSessionStateForTests(9, ['diagnostics', 'screenshot']);

  expect(getAttachedClients(9)).toEqual(['diagnostics', 'screenshot']);
  expect(getAttachedClients(99)).toEqual([]);
});

it('resolves target owners and clears state on a forceful detach', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  seedDebuggerSessionStateForTests(9, ['diagnostics'], 'target-9');
  seedDebuggerSessionStateForTests(12, [], 'target-12');

  expect(getTabIdByTargetId('target-12')).toBe(12);

  handleForcefulDetach(9);

  expect(getDebuggerSessionSnapshotForTests(9)).toEqual({ clients: [], targetId: null });
  expect(getTabIdByTargetId('target-9')).toBeUndefined();
  expect(consoleWarnSpy).toHaveBeenCalledWith('[BackgroundDebugger]', 'Forceful detach for tab', 9);
});
