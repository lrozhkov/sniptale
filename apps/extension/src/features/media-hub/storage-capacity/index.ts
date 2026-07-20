const MIN_MEDIA_HUB_FREE_BYTES = 50 * 1024 * 1024;

export type StoragePressureLevel = 'healthy' | 'warning' | 'critical';

export interface StorageEstimateInfo {
  usage: number;
  quota: number;
  remaining: number;
  usageRatio: number;
  pressure: StoragePressureLevel;
  isPersistent: boolean | null;
}

export interface StorageQuotaHeadroomFailurePayload {
  kind: 'storage-headroom-low';
  requiredFreeBytes: number;
  estimate: StorageEstimateInfo;
}

export class StorageQuotaHeadroomError extends Error {
  readonly isStorageQuotaHeadroomError = true;
  readonly payload: StorageQuotaHeadroomFailurePayload;

  constructor(payload: StorageQuotaHeadroomFailurePayload) {
    super('storage headroom is below required bytes');
    this.name = 'StorageQuotaHeadroomError';
    this.payload = payload;
  }
}

export function isStorageQuotaHeadroomError(error: unknown): error is StorageQuotaHeadroomError {
  return (
    error instanceof StorageQuotaHeadroomError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { isStorageQuotaHeadroomError?: unknown }).isStorageQuotaHeadroomError === true)
  );
}

function resolvePressure(usageRatio: number): StoragePressureLevel {
  if (usageRatio >= 0.9) {
    return 'critical';
  }

  if (usageRatio >= 0.7) {
    return 'warning';
  }

  return 'healthy';
}

export async function getStorageEstimateInfo(): Promise<StorageEstimateInfo> {
  if (!navigator.storage?.estimate) {
    return {
      usage: 0,
      quota: 0,
      remaining: 0,
      usageRatio: 0,
      pressure: 'healthy',
      isPersistent: null,
    };
  }

  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted
      ? navigator.storage.persisted().catch(() => null)
      : Promise.resolve(null),
  ]);
  const usage = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  const remaining = Math.max(0, quota - usage);
  const usageRatio = quota > 0 ? usage / quota : 0;

  return {
    usage,
    quota,
    remaining,
    usageRatio,
    pressure: resolvePressure(usageRatio),
    isPersistent: persisted,
  };
}

export async function ensureMediaHubStorageHeadroom(
  minimumFreeBytes = MIN_MEDIA_HUB_FREE_BYTES
): Promise<StorageEstimateInfo> {
  const estimate = await getStorageEstimateInfo();

  if (estimate.quota > 0 && estimate.remaining < minimumFreeBytes) {
    throw new StorageQuotaHeadroomError({
      estimate,
      kind: 'storage-headroom-low',
      requiredFreeBytes: minimumFreeBytes,
    });
  }

  return estimate;
}
