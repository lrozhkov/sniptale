import { describe, expect, it, vi } from 'vitest';
import { getStore } from './index';

type BackupTransaction = Parameters<typeof getStore>[0];
type BackupObjectStore = ReturnType<BackupTransaction['objectStore']>;

describe('media hub backup storage', () => {
  it('returns the requested object store from the transaction facade', () => {
    const store: BackupObjectStore = {
      delete: vi.fn(),
      get: vi.fn(),
      index: vi.fn(() => ({ getAll: vi.fn(async () => []) })),
      put: vi.fn(),
    };
    const objectStore = vi.fn().mockReturnValue(store);
    const tx: BackupTransaction = { objectStore };

    expect(getStore(tx, 'media_library')).toBe(store);
    expect(objectStore).toHaveBeenCalledWith('media_library');
  });
});
