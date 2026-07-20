import { beforeEach, expect, it, vi } from 'vitest';

const { browserDebugger, withTimeout } = vi.hoisted(() => ({
  browserDebugger: {
    detach: vi.fn(),
  },
  withTimeout: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger,
}));

vi.mock('../infra', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infra')>()),
  withTimeout,
}));

import { detachDebugger } from './detach';
import { detachDebuggerForPrivacyErasure } from './detach.privacy-erasure';
import { detachDebuggerClient } from './detach-core';
import * as debuggerSession from './index';
import {
  getDebuggerSessionSnapshotForTests,
  resetDebuggerSessionStateForTests,
  seedDebuggerSessionStateForTests,
} from './index';

beforeEach(() => {
  vi.clearAllMocks();
  resetDebuggerSessionStateForTests();

  browserDebugger.detach.mockResolvedValue(undefined);
  withTimeout.mockImplementation((promise: Promise<unknown>) => promise);
});

it('returns every core detach outcome without releasing after unexpected failure', async () => {
  await expect(detachDebuggerClient(7, 'screenshot')).resolves.toEqual({
    status: 'not-owned',
  });

  seedDebuggerSessionStateForTests(7, ['screenshot', 'diagnostics']);
  await expect(detachDebuggerClient(7, 'screenshot')).resolves.toEqual({
    status: 'released-shared',
  });

  resetDebuggerSessionStateForTests();
  seedDebuggerSessionStateForTests(7, ['screenshot'], 'target-7');
  await expect(detachDebuggerClient(7, 'screenshot')).resolves.toEqual({ status: 'detached' });

  seedDebuggerSessionStateForTests(8, ['diagnostics'], 'target-8');
  withTimeout.mockRejectedValueOnce(new Error('Not attached to the debugger'));
  await expect(detachDebuggerClient(8, 'diagnostics')).resolves.toEqual({
    status: 'already-detached',
  });

  seedDebuggerSessionStateForTests(9, ['export-har'], 'target-9');
  const failure = new Error('detach failed');
  withTimeout.mockRejectedValueOnce(failure);
  await expect(detachDebuggerClient(9, 'export-har')).resolves.toEqual({
    error: failure,
    status: 'failed',
  });
  expect(getDebuggerSessionSnapshotForTests(9).clients).toEqual(['export-har']);
});

it('releases client ownership exactly once for terminal success outcomes', async () => {
  const releaseSpy = vi.spyOn(debuggerSession, 'releaseAttachedClient');
  seedDebuggerSessionStateForTests(7, ['screenshot'], 'target-7');

  await detachDebuggerClient(7, 'screenshot');

  expect(releaseSpy).toHaveBeenCalledOnce();
  releaseSpy.mockClear();
  seedDebuggerSessionStateForTests(8, ['diagnostics'], 'target-8');
  withTimeout.mockRejectedValueOnce(new Error('Not attached to the debugger'));

  await detachDebuggerClient(8, 'diagnostics');

  expect(releaseSpy).toHaveBeenCalledOnce();
  releaseSpy.mockRestore();
});

it('returns early when the tab has no attached debugger clients', async () => {
  await expect(detachDebugger(7, 'screenshot')).resolves.toBeUndefined();

  expect(browserDebugger.detach).not.toHaveBeenCalled();
  expect(withTimeout).not.toHaveBeenCalled();
  expect(getDebuggerSessionSnapshotForTests(7)).toEqual({ clients: [], targetId: null });
});

it('keeps the debugger attached while other clients still own the tab', async () => {
  seedDebuggerSessionStateForTests(7, ['screenshot', 'diagnostics']);

  await detachDebugger(7, 'screenshot');

  expect(getDebuggerSessionSnapshotForTests(7)).toEqual({
    clients: ['diagnostics'],
    targetId: null,
  });
  expect(browserDebugger.detach).not.toHaveBeenCalled();
});

it('detaches from chrome when the last client releases the tab', async () => {
  seedDebuggerSessionStateForTests(7, ['screenshot'], 'target-7');

  await detachDebugger(7, 'screenshot');

  expect(getDebuggerSessionSnapshotForTests(7)).toEqual({ clients: [], targetId: null });
  expect(browserDebugger.detach).toHaveBeenCalledWith({ tabId: 7 });
  expect(withTimeout).toHaveBeenCalledWith(
    expect.any(Promise),
    expect.any(Number),
    'debugger.detach'
  );
});

it('swallows not-attached detach failures for the last client', async () => {
  seedDebuggerSessionStateForTests(7, ['screenshot'], 'target-7');
  withTimeout.mockRejectedValue(new Error('Not attached to the debugger'));

  await expect(detachDebugger(7, 'screenshot')).resolves.toBeUndefined();
});

it('logs and swallows unexpected detach failures for the last client', async () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  seedDebuggerSessionStateForTests(7, ['screenshot'], 'target-7');
  withTimeout.mockRejectedValue(new Error('detach failed'));

  await expect(detachDebugger(7, 'screenshot')).resolves.toBeUndefined();

  expect(consoleErrorSpy).toHaveBeenCalledWith(
    '[BackgroundDebuggerDetach]',
    'Failed to detach',
    expect.any(Error)
  );
  expect(getDebuggerSessionSnapshotForTests(7)).toEqual({
    clients: ['screenshot'],
    targetId: 'target-7',
  });

  consoleErrorSpy.mockRestore();
});

it('retains the final client when strict privacy detach fails so cleanup can retry', async () => {
  seedDebuggerSessionStateForTests(7, ['diagnostics'], 'target-7');
  withTimeout.mockRejectedValueOnce(new Error('detach failed'));

  await expect(detachDebuggerForPrivacyErasure(7, 'diagnostics')).rejects.toThrow(
    'Debugger detach failed during local data erasure'
  );
  expect(getDebuggerSessionSnapshotForTests(7)).toEqual({
    clients: ['diagnostics'],
    targetId: 'target-7',
  });
});

it('skips strict privacy detach when the client does not own the tab', async () => {
  await detachDebuggerForPrivacyErasure(7, 'diagnostics');

  expect(browserDebugger.detach).not.toHaveBeenCalled();
});

it('releases only strict privacy ownership while another debugger client remains', async () => {
  seedDebuggerSessionStateForTests(7, ['diagnostics', 'export-har'], 'target-7');

  await detachDebuggerForPrivacyErasure(7, 'diagnostics');

  expect(browserDebugger.detach).not.toHaveBeenCalled();
  expect(getDebuggerSessionSnapshotForTests(7).clients).toEqual(['export-har']);
});

it('accepts an already-detached debugger as strict privacy success', async () => {
  seedDebuggerSessionStateForTests(7, ['diagnostics'], 'target-7');
  withTimeout.mockRejectedValueOnce(new Error('Not attached to the debugger'));

  await expect(detachDebuggerForPrivacyErasure(7, 'diagnostics')).resolves.toBeUndefined();
  expect(getDebuggerSessionSnapshotForTests(7)).toEqual({ clients: [], targetId: null });
});

it('releases strict privacy ownership only after the debugger effect is gone', async () => {
  seedDebuggerSessionStateForTests(7, ['diagnostics'], 'target-7');

  await detachDebuggerForPrivacyErasure(7, 'diagnostics');

  expect(browserDebugger.detach).toHaveBeenCalledWith({ tabId: 7 });
  expect(getDebuggerSessionSnapshotForTests(7)).toEqual({ clients: [], targetId: null });
});
