import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { readAssetFileMock } = vi.hoisted(() => ({ readAssetFileMock: vi.fn() }));

vi.mock('../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/assets')>()),
  readAssetFile: readAssetFileMock,
}));

import {
  PAGE_PACKAGE_DOWNLOAD_LEASE_LIMITS_FOR_TESTS,
  confirmPagePackageDownloadLease,
  createPagePackageDownloadLease,
  releaseAllPagePackageDownloadLeases,
  releasePagePackageDownloadLease,
} from './lease';

const reference = {
  assetId: 'asset-1',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-1' },
  mimeType: 'application/vnd.sniptale.page-package+zip',
  sha256: null,
  size: 7,
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  readAssetFileMock.mockResolvedValue(
    new File(['package'], 'page.zip', { type: reference.mimeType })
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:lease');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(async () => {
  await releaseAllPagePackageDownloadLeases();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('offscreen Page Package download lease owner', () => {
  it('replays create by operation identity, confirms, and releases exactly once', async () => {
    const first = await createPagePackageDownloadLease({
      downloadOperationId: 'operation-1',
      filename: 'page.zip',
      reference,
    });
    const replay = await createPagePackageDownloadLease({
      downloadOperationId: 'operation-1',
      filename: 'page.zip',
      reference,
    });
    expect(replay).toEqual(first);
    expect(readAssetFileMock).toHaveBeenCalledTimes(1);
    expect(
      confirmPagePackageDownloadLease({ ...first, downloadOperationId: 'operation-1' })
    ).toEqual({ result: 'confirmed' });
    vi.advanceTimersByTime(PAGE_PACKAGE_DOWNLOAD_LEASE_LIMITS_FOR_TESTS.unconfirmedTtlMs);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(
      releasePagePackageDownloadLease({ ...first, downloadOperationId: 'operation-1' })
    ).toEqual({ result: 'released' });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:lease');
  });

  it('revokes an unconfirmed orphan after its bounded TTL', async () => {
    await createPagePackageDownloadLease({
      downloadOperationId: 'operation-2',
      filename: 'page.zip',
      reference,
    });
    vi.advanceTimersByTime(PAGE_PACKAGE_DOWNLOAD_LEASE_LIMITS_FOR_TESTS.unconfirmedTtlMs);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:lease');
  });

  it('rejects replay with a different asset reference', async () => {
    await createPagePackageDownloadLease({
      downloadOperationId: 'operation-3',
      filename: 'page.zip',
      reference,
    });
    await expect(
      createPagePackageDownloadLease({
        downloadOperationId: 'operation-3',
        filename: 'page.zip',
        reference: {
          ...reference,
          assetId: 'asset-2',
          location: { kind: 'opfs', objectKey: 'objects/asset-2' },
        },
      })
    ).rejects.toThrow('changed its asset reference');
  });

  it('coalesces overlapping creates and rejects a conflicting in-flight replay', async () => {
    const file = new File(['package'], 'page.zip', { type: reference.mimeType });
    const deferred = createDeferred<File>();
    readAssetFileMock.mockReset();
    readAssetFileMock.mockReturnValueOnce(deferred.promise);
    const first = createPagePackageDownloadLease({
      downloadOperationId: 'operation-4',
      filename: 'page.zip',
      reference,
    });
    const replay = createPagePackageDownloadLease({
      downloadOperationId: 'operation-4',
      filename: 'page.zip',
      reference,
    });
    await expect(
      createPagePackageDownloadLease({
        downloadOperationId: 'operation-4',
        filename: 'page.zip',
        reference: {
          ...reference,
          assetId: 'asset-2',
          location: { kind: 'opfs', objectKey: 'objects/asset-2' },
        },
      })
    ).rejects.toThrow('changed its asset reference');
    expect(readAssetFileMock).toHaveBeenCalledTimes(1);
    deferred.resolve(file);
    await expect(Promise.all([first, replay])).resolves.toEqual([
      expect.objectContaining({ leaseId: expect.any(String), url: 'blob:lease' }),
      expect.objectContaining({ leaseId: expect.any(String), url: 'blob:lease' }),
    ]);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
