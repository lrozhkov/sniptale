import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  readLease: vi.fn(),
  releaseLease: vi.fn(),
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

function createLease(tabId = 21) {
  return {
    backendKind: 'native' as const,
    documentId: 'document-1',
    expiresAtEpochMs: Date.now() + 10_000,
    exportRunId: 'batch-1',
    jobId: 'job-1',
    ownerToken: 'owner-1',
    runtimeGeneration: 'runtime-1',
    tabId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readLease.mockResolvedValue(null);
  mocks.releaseLease.mockResolvedValue(undefined);
});

it('restores the exact interrupted native document and releases its lease', async () => {
  const restore = vi.fn().mockResolvedValue(undefined);
  mocks.readLease.mockResolvedValue(createLease());
  mocks.createAgent.mockReturnValue({ restore });

  await cleanupCapture(21);

  expect(mocks.createAgent).toHaveBeenCalledWith({ documentId: 'document-1', tabId: 21 });
  expect(restore).toHaveBeenCalledWith({
    jobId: 'job-1',
    ownerToken: 'owner-1',
    runtimeGeneration: 'runtime-1',
  });
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-1');
});

it('does not touch a lease belonging to another tab', async () => {
  mocks.readLease.mockResolvedValue(createLease(22));

  await cleanupCapture(21);

  expect(mocks.createAgent).not.toHaveBeenCalled();
  expect(mocks.releaseLease).not.toHaveBeenCalled();
});

it('retries a retained lease when native page restoration fails', async () => {
  mocks.readLease.mockResolvedValue(createLease());
  mocks.createAgent.mockReturnValue({
    restore: vi.fn().mockRejectedValue(new Error('restore pending')),
  });

  await expect(cleanupCapture(21)).rejects.toThrow('Interrupted full-page capture cleanup failed');
  expect(mocks.releaseLease).not.toHaveBeenCalled();
});

it('treats a removed target document as terminal and releases the lease', async () => {
  mocks.readLease.mockResolvedValue(createLease(25));
  mocks.createAgent.mockReturnValue({
    restore: vi.fn().mockRejectedValue(new Error('No document with id document-1')),
  });

  await expect(cleanupCapture(25)).resolves.toBeUndefined();
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-1');
});

it('cleans the stored native lease through the same owner path', async () => {
  mocks.readLease.mockResolvedValue(createLease(23));
  mocks.createAgent.mockReturnValue({ restore: vi.fn().mockResolvedValue(undefined) });

  await cleanupStoredFullPageCaptureLease();

  expect(mocks.createAgent).toHaveBeenCalledWith({ documentId: 'document-1', tabId: 23 });
  expect(mocks.releaseLease).toHaveBeenCalledWith('owner-1');
});
