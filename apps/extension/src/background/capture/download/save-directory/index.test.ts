import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserStorageLocalGetMock, browserStorageLocalSetMock } = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: browserStorageLocalGetMock,
      set: browserStorageLocalSetMock,
    },
  },
}));

import { getLastSaveAsDirectory, setLastSaveAsDirectory } from './index';

function resetSaveAsDirectoryMocks() {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
}

async function verifySetContractAndRejectedWriteFallback() {
  setLastSaveAsDirectory('Screenshots/Project A');

  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    sniptale_last_save_as_dir: 'Screenshots/Project A',
  });

  browserStorageLocalSetMock.mockRejectedValueOnce(new Error('write failed'));

  expect(() => setLastSaveAsDirectory('Screenshots/Project B')).not.toThrow();
  await Promise.resolve();

  expect(console.warn).toHaveBeenCalledWith(
    '[SharedSaveAsDirectoryStorage]',
    'Failed to persist last save-as directory',
    expect.any(Error)
  );
}

function verifyUnsafeWriteIsIgnored() {
  setLastSaveAsDirectory('../outside');

  expect(browserStorageLocalSetMock).not.toHaveBeenCalled();
  expect(console.warn).toHaveBeenCalledWith(
    '[SharedSaveAsDirectoryStorage]',
    'Ignoring invalid save-as directory before persisting'
  );
}

async function verifyRelativeAndUnsafePathReads() {
  browserStorageLocalGetMock
    .mockResolvedValueOnce({ sniptale_last_save_as_dir: 'Screenshots/Project A' })
    .mockResolvedValueOnce({ sniptale_last_save_as_dir: '/absolute/path' })
    .mockResolvedValueOnce({ sniptale_last_save_as_dir: 'C:\\absolute\\path' })
    .mockResolvedValueOnce({ sniptale_last_save_as_dir: '../outside' })
    .mockResolvedValueOnce({ sniptale_last_save_as_dir: 42 });

  await expect(getLastSaveAsDirectory()).resolves.toBe('Screenshots/Project A');
  await expect(getLastSaveAsDirectory()).resolves.toBe('');
  await expect(getLastSaveAsDirectory()).resolves.toBe('');
  await expect(getLastSaveAsDirectory()).resolves.toBe('');
  await expect(getLastSaveAsDirectory()).resolves.toBe('');

  expect(console.warn).toHaveBeenNthCalledWith(
    1,
    '[SharedSaveAsDirectoryStorage]',
    'Ignoring invalid persisted save-as directory'
  );
  expect(console.warn).toHaveBeenNthCalledWith(
    2,
    '[SharedSaveAsDirectoryStorage]',
    'Ignoring invalid persisted save-as directory'
  );
  expect(console.warn).toHaveBeenNthCalledWith(
    3,
    '[SharedSaveAsDirectoryStorage]',
    'Ignoring invalid persisted save-as directory'
  );
  expect(console.warn).toHaveBeenNthCalledWith(
    4,
    '[SharedSaveAsDirectoryStorage]',
    'Ignoring invalid persisted save-as directory'
  );
}

describe('save-as-directory', () => {
  beforeEach(resetSaveAsDirectoryMocks);

  it(
    'writes the last save-as directory and swallows rejected writes',
    verifySetContractAndRejectedWriteFallback
  );
  it('ignores invalid save-as directories before persisting', verifyUnsafeWriteIsIgnored);
  it('returns only relative directory paths from storage', verifyRelativeAndUnsafePathReads);
});
