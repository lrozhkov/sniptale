// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function setNavigatorStorage(storage: Partial<StorageManager> | undefined) {
  vi.stubGlobal('navigator', {
    storage,
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('storage-quota estimate flows', () => {
  it('returns a zeroed healthy estimate when storage APIs are unavailable', async () => {
    setNavigatorStorage(undefined);
    const { getStorageEstimateInfo } = await import('./index');

    await expect(getStorageEstimateInfo()).resolves.toEqual({
      isPersistent: null,
      pressure: 'healthy',
      quota: 0,
      remaining: 0,
      usage: 0,
      usageRatio: 0,
    });
  });

  it('computes storage estimates and pressure levels without mutating storage state', async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 1000, usage: 950 });
    const persisted = vi.fn().mockRejectedValue(new Error('unsupported'));
    setNavigatorStorage({
      estimate,
      persisted,
    });
    const { getStorageEstimateInfo } = await import('./index');

    await expect(getStorageEstimateInfo()).resolves.toEqual({
      isPersistent: null,
      pressure: 'critical',
      quota: 1000,
      remaining: 50,
      usage: 950,
      usageRatio: 0.95,
    });
    expect(estimate).toHaveBeenCalledTimes(1);
    expect(persisted).toHaveBeenCalledTimes(1);

    setNavigatorStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 750 }),
      persisted: vi.fn().mockResolvedValue(true),
    });
    await expect(getStorageEstimateInfo()).resolves.toEqual({
      isPersistent: true,
      pressure: 'warning',
      quota: 1000,
      remaining: 250,
      usage: 750,
      usageRatio: 0.75,
    });
  });
});

describe('storage-quota headroom flow', () => {
  it('rejects low media hub headroom with a typed machine-readable payload', async () => {
    setNavigatorStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 980 }),
      persisted: vi.fn().mockResolvedValue(false),
    });
    const { ensureMediaHubStorageHeadroom, isStorageQuotaHeadroomError } = await import('./index');

    await expect(ensureMediaHubStorageHeadroom(50)).rejects.toMatchObject({
      isStorageQuotaHeadroomError: true,
      message: 'storage headroom is below required bytes',
      name: 'StorageQuotaHeadroomError',
      payload: {
        estimate: {
          isPersistent: false,
          pressure: 'critical',
          quota: 1000,
          remaining: 20,
          usage: 980,
          usageRatio: 0.98,
        },
        kind: 'storage-headroom-low',
        requiredFreeBytes: 50,
      },
    });

    await ensureMediaHubStorageHeadroom(50).catch((error: unknown) => {
      expect(isStorageQuotaHeadroomError(error)).toBe(true);
    });
    expect(isStorageQuotaHeadroomError({ isStorageQuotaHeadroomError: true })).toBe(true);
    expect(isStorageQuotaHeadroomError({ isStorageQuotaHeadroomError: false })).toBe(false);
  });

  it('returns the estimate when enough space remains', async () => {
    setNavigatorStorage({
      estimate: vi.fn().mockResolvedValue({ quota: 1000, usage: 400 }),
      persisted: vi.fn().mockResolvedValue(false),
    });
    const { ensureMediaHubStorageHeadroom } = await import('./index');

    await expect(ensureMediaHubStorageHeadroom(50)).resolves.toEqual({
      isPersistent: false,
      pressure: 'healthy',
      quota: 1000,
      remaining: 600,
      usage: 400,
      usageRatio: 0.4,
    });
  });
});
