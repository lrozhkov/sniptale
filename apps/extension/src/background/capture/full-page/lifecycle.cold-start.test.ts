import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  browserDebuggerDetach: vi.fn(),
  createAgent: vi.fn(),
  readLease: vi.fn(),
  releaseLease: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger: {
    detach: mocks.browserDebuggerDetach,
    sendCommand: vi.fn(),
  },
}));
vi.mock('./page-agent-transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page-agent-transport')>()),
  createFullPagePageAgentTransport: mocks.createAgent,
}));
vi.mock('./session-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-lease')>()),
  readStoredFullPageCaptureLease: mocks.readLease,
  releaseFullPageCaptureLease: mocks.releaseLease,
}));

import { resetDebuggerSessionStateForTests } from '../../debugger/session';
import { cleanupStoredFullPageCaptureLease } from './lifecycle';

beforeEach(() => {
  vi.clearAllMocks();
  resetDebuggerSessionStateForTests();
  mocks.browserDebuggerDetach.mockResolvedValue(undefined);
  mocks.createAgent.mockReturnValue({ restore: vi.fn().mockResolvedValue(undefined) });
  mocks.readLease.mockResolvedValue({
    backendKind: 'unattended-cdp',
    documentId: 'document-cold',
    expiresAtEpochMs: Date.now() + 10_000,
    jobId: 'job-cold',
    ownerToken: 'owner-cold',
    runtimeGeneration: 'runtime-previous',
    tabId: 31,
  });
  mocks.releaseLease.mockResolvedValue(undefined);
});

it('detaches Chrome and clears the durable CDP lease after a cold worker start', async () => {
  await cleanupStoredFullPageCaptureLease();

  expect(mocks.browserDebuggerDetach).toHaveBeenCalledWith({ tabId: 31 });
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-cold');
});

it('retains the durable lease until a failed cold-start detach can be retried', async () => {
  mocks.browserDebuggerDetach
    .mockRejectedValueOnce(new Error('cold detach failed'))
    .mockResolvedValueOnce(undefined);

  await expect(cleanupStoredFullPageCaptureLease()).rejects.toThrow(
    'Interrupted full-page capture cleanup failed'
  );
  expect(mocks.releaseLease).not.toHaveBeenCalled();

  await expect(cleanupStoredFullPageCaptureLease()).resolves.toBeUndefined();
  expect(mocks.browserDebuggerDetach).toHaveBeenCalledTimes(2);
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-cold');
});

it('releases the durable lease when the captured tab no longer exists', async () => {
  mocks.createAgent.mockReturnValue({
    restore: vi.fn().mockRejectedValue(new Error('No tab with id: 31')),
  });
  mocks.browserDebuggerDetach.mockRejectedValueOnce(new Error('No tab with id: 31'));

  await expect(cleanupStoredFullPageCaptureLease()).resolves.toBeUndefined();

  expect(mocks.browserDebuggerDetach).toHaveBeenCalledWith({ tabId: 31 });
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-cold');
});
