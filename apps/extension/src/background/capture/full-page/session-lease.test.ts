import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock('../../storage/full-page-capture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/full-page-capture')>()),
  clearStoredFullPageCaptureLease: mocks.clear,
  readStoredFullPageCaptureLease: mocks.read,
  writeStoredFullPageCaptureLease: mocks.write,
}));

import {
  acquireFullPageCaptureLease,
  releaseFullPageCaptureLease,
  renewFullPageCaptureLease,
} from './session-lease';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(null);
  mocks.write.mockResolvedValue(undefined);
  mocks.clear.mockResolvedValue(undefined);
});

const leaseIdentity = {
  backendKind: 'native' as const,
  documentId: 'document-1',
  jobId: 'job-1',
  ownerToken: 'owner-1',
  runtimeGeneration: 'runtime-1',
  tabId: 7,
};

it('persists a 30 second document-bound full-page lease', async () => {
  const before = Date.now();
  await acquireFullPageCaptureLease(leaseIdentity);

  expect(mocks.write).toHaveBeenCalledWith(
    expect.objectContaining({
      ...leaseIdentity,
      expiresAtEpochMs: expect.any(Number),
    })
  );
  const written = mocks.write.mock.calls[0]?.[0];
  expect(written.expiresAtEpochMs).toBeGreaterThanOrEqual(before + 29_000);
});

it('fails closed behind another owner and renews only the current owner', async () => {
  mocks.read.mockResolvedValue({
    ...leaseIdentity,
    expiresAtEpochMs: Date.now() + 10_000,
    ownerToken: 'other-owner',
  });
  await expect(acquireFullPageCaptureLease(leaseIdentity)).rejects.toThrow(
    'Another full-page capture requires recovery'
  );

  await expect(renewFullPageCaptureLease('owner-1')).rejects.toThrow(
    'Full-page capture lease is missing or stale'
  );
  expect(mocks.write).not.toHaveBeenCalled();
});

it('does not overwrite expired foreign recovery authority', async () => {
  mocks.read.mockResolvedValue({
    ...leaseIdentity,
    expiresAtEpochMs: Date.now() - 1,
    ownerToken: 'expired-owner',
  });

  await expect(acquireFullPageCaptureLease(leaseIdentity)).rejects.toThrow('requires recovery');
  expect(mocks.write).not.toHaveBeenCalled();
});

it('delegates conditional release to the storage owner', async () => {
  await releaseFullPageCaptureLease('owner-1');
  expect(mocks.clear).toHaveBeenCalledWith('owner-1');
});
