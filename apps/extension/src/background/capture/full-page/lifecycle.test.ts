import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  readLease: vi.fn(),
  recoverCdp: vi.fn(),
  releaseLease: vi.fn(),
}));

vi.mock('./cdp-backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cdp-backend')>()),
  recoverOwnedCdpLease: mocks.recoverCdp,
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

import { cleanupCapture, cleanupStoredFullPageCaptureLease } from './lifecycle';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recoverCdp.mockResolvedValue(undefined);
  mocks.releaseLease.mockResolvedValue(undefined);
});

it('restores the exact interrupted document and releases only the matching unattended owner', async () => {
  const restore = vi.fn().mockResolvedValue(undefined);
  mocks.readLease.mockResolvedValue({
    backendKind: 'unattended-cdp',
    documentId: 'document-1',
    expiresAtEpochMs: Date.now() + 10_000,
    exportRunId: 'batch-1',
    jobId: 'job-1',
    ownerToken: 'owner-1',
    runtimeGeneration: 'runtime-1',
    tabId: 21,
  });
  mocks.createAgent.mockReturnValue({ restore });

  await cleanupCapture(21);

  expect(mocks.createAgent).toHaveBeenCalledWith({ documentId: 'document-1', tabId: 21 });
  expect(restore).toHaveBeenCalledWith({
    jobId: 'job-1',
    ownerToken: 'owner-1',
    runtimeGeneration: 'runtime-1',
  });
  expect(mocks.recoverCdp).toHaveBeenCalledWith(21, 'owner-1');
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-1');
});

it('does not touch a lease belonging to another tab', async () => {
  mocks.readLease.mockResolvedValue({ tabId: 22 });

  await cleanupCapture(21);

  expect(mocks.createAgent).not.toHaveBeenCalled();
  expect(mocks.recoverCdp).not.toHaveBeenCalled();
  expect(mocks.releaseLease).not.toHaveBeenCalled();
});

it('retries the retained durable lease independently of terminal capture-job state', async () => {
  mocks.readLease.mockResolvedValue({
    backendKind: 'unattended-cdp',
    documentId: 'document-terminal-job',
    expiresAtEpochMs: Date.now() + 10_000,
    jobId: 'failed-job',
    ownerToken: 'owner-terminal-job',
    runtimeGeneration: 'runtime-previous',
    tabId: 23,
  });
  mocks.createAgent.mockReturnValue({ restore: vi.fn().mockResolvedValue(undefined) });

  await cleanupStoredFullPageCaptureLease();

  expect(mocks.recoverCdp).toHaveBeenCalledWith(23, 'owner-terminal-job');
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-terminal-job');
});

it('retains the durable storage lease when owned CDP cleanup needs a retry', async () => {
  mocks.readLease.mockResolvedValue({
    backendKind: 'unattended-cdp',
    documentId: 'document-1',
    expiresAtEpochMs: Date.now() + 10_000,
    jobId: 'job-1',
    ownerToken: 'owner-1',
    runtimeGeneration: 'runtime-1',
    tabId: 21,
  });
  mocks.createAgent.mockReturnValue({ restore: vi.fn().mockRejectedValue(new Error('restore')) });
  mocks.recoverCdp.mockRejectedValueOnce(new Error('detach')).mockResolvedValueOnce(undefined);

  await expect(cleanupCapture(21)).rejects.toThrow('Interrupted full-page capture cleanup failed');
  expect(mocks.releaseLease).not.toHaveBeenCalled();

  mocks.createAgent.mockReturnValue({ restore: vi.fn().mockResolvedValue(undefined) });
  await expect(cleanupCapture(21)).resolves.toBeUndefined();
  expect(mocks.recoverCdp).toHaveBeenCalledTimes(2);
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-1');
});

it('retains the durable storage lease when page restoration needs a retry', async () => {
  mocks.readLease.mockResolvedValue({
    backendKind: 'native',
    documentId: 'document-restore-retry',
    expiresAtEpochMs: Date.now() - 1,
    jobId: 'job-restore-retry',
    ownerToken: 'owner-restore-retry',
    runtimeGeneration: 'runtime-previous',
    tabId: 24,
  });
  mocks.createAgent.mockReturnValue({ restore: vi.fn().mockRejectedValue(new Error('restore')) });

  await expect(cleanupCapture(24)).rejects.toThrow('Interrupted full-page capture cleanup failed');

  expect(mocks.releaseLease).not.toHaveBeenCalled();
});

it('treats a removed target document as terminal and releases the recovered owner', async () => {
  mocks.readLease.mockResolvedValue({
    backendKind: 'unattended-cdp',
    documentId: 'document-removed',
    expiresAtEpochMs: Date.now() - 1,
    jobId: 'job-removed',
    ownerToken: 'owner-removed',
    runtimeGeneration: 'runtime-previous',
    tabId: 25,
  });
  mocks.createAgent.mockReturnValue({
    restore: vi.fn().mockRejectedValue(new Error('No document with id document-removed')),
  });

  await expect(cleanupCapture(25)).resolves.toBeUndefined();

  expect(mocks.recoverCdp).toHaveBeenCalledWith(25, 'owner-removed');
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-removed');
});

it('does not treat a missing receiver as proof that the page target is gone', async () => {
  mocks.readLease.mockResolvedValue({
    backendKind: 'native',
    documentId: 'document-no-receiver',
    expiresAtEpochMs: Date.now() - 1,
    jobId: 'job-no-receiver',
    ownerToken: 'owner-no-receiver',
    runtimeGeneration: 'runtime-previous',
    tabId: 26,
  });
  mocks.createAgent.mockReturnValue({
    restore: vi
      .fn()
      .mockRejectedValue(
        new Error('Could not establish connection. Receiving end does not exist.')
      ),
  });

  await expect(cleanupCapture(26)).rejects.toThrow('Interrupted full-page capture cleanup failed');

  expect(mocks.releaseLease).not.toHaveBeenCalled();
});
