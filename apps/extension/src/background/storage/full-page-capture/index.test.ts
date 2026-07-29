import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  available: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: {
        get: mocks.get,
        isAvailable: mocks.available,
        remove: mocks.remove,
        set: mocks.set,
      },
    },
  })
);

import {
  clearStoredFullPageCaptureLease,
  readStoredFullPageCaptureLease,
  writeStoredFullPageCaptureLease,
} from './index';

const lease = {
  backendKind: 'native' as const,
  documentId: 'document-1',
  expiresAtEpochMs: 2_000,
  exportRunId: 'export-1',
  jobId: 'job-1',
  ownerToken: 'owner-1',
  runtimeGeneration: 'runtime-1',
  tabId: 7,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.available.mockReturnValue(true);
  mocks.get.mockResolvedValue({});
  mocks.remove.mockResolvedValue(undefined);
  mocks.set.mockResolvedValue(undefined);
});

it('parses only the exact storage-backed full-page lease shape', async () => {
  mocks.get
    .mockResolvedValueOnce({ sniptale_full_page_capture_lease: lease })
    .mockResolvedValueOnce({
      sniptale_full_page_capture_lease: { ...lease, tabId: '7' },
    });

  await expect(readStoredFullPageCaptureLease()).resolves.toEqual(lease);
  await expect(readStoredFullPageCaptureLease()).resolves.toBeNull();
});

it('writes the canonical session key and removes only the matching owner lease', async () => {
  await writeStoredFullPageCaptureLease(lease);
  mocks.get
    .mockResolvedValueOnce({
      sniptale_full_page_capture_lease: { ...lease, ownerToken: 'other-owner' },
    })
    .mockResolvedValueOnce({ sniptale_full_page_capture_lease: lease });

  await clearStoredFullPageCaptureLease('owner-1');
  await clearStoredFullPageCaptureLease('owner-1');

  expect(mocks.set).toHaveBeenCalledWith({ sniptale_full_page_capture_lease: lease });
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.remove).toHaveBeenCalledWith('sniptale_full_page_capture_lease');
});

it('fails closed for writes and no-ops reads when session storage is unavailable', async () => {
  mocks.available.mockReturnValue(false);

  await expect(readStoredFullPageCaptureLease()).resolves.toBeNull();
  await expect(writeStoredFullPageCaptureLease(lease)).rejects.toThrow(
    'Session storage is unavailable'
  );
  await expect(clearStoredFullPageCaptureLease()).resolves.toBeUndefined();
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
