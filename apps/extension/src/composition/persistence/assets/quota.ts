export const ASSET_WRITE_HEADROOM_BYTES = 64 * 1024 * 1024;

export async function assertAssetWriteAdmission(
  requestedBytes: number,
  estimate: () => Promise<StorageEstimate> = () => navigator.storage.estimate()
): Promise<void> {
  if (!Number.isSafeInteger(requestedBytes) || requestedBytes < 0) {
    throw new Error('Asset write size must be a non-negative safe integer.');
  }
  const { quota, usage } = await estimate();
  if (
    typeof quota === 'number' &&
    Number.isFinite(quota) &&
    typeof usage === 'number' &&
    Number.isFinite(usage) &&
    usage + requestedBytes + ASSET_WRITE_HEADROOM_BYTES > quota
  ) {
    throw new DOMException('Insufficient storage quota for asset write.', 'QuotaExceededError');
  }
}

export function createAggregateAssetReservation(limit: number) {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('Asset reservation limit must be a positive safe integer.');
  }
  let reserved = 0;
  return {
    getReservedBytes: () => reserved,
    release(bytes: number) {
      reserved = Math.max(0, reserved - bytes);
    },
    reserve(bytes: number) {
      if (!Number.isSafeInteger(bytes) || bytes < 0 || reserved + bytes > limit) {
        throw new DOMException('Asset aggregate reservation exceeded.', 'QuotaExceededError');
      }
      reserved += bytes;
    },
  };
}
