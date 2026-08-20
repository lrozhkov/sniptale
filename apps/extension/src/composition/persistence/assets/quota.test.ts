import { expect, it, vi } from 'vitest';
import {
  ASSET_WRITE_HEADROOM_BYTES,
  assertAssetWriteAdmission,
  createAggregateAssetReservation,
} from './quota';

it('rejects a write that would consume the reserved 64 MiB headroom', async () => {
  const estimate = vi.fn().mockResolvedValue({
    quota: ASSET_WRITE_HEADROOM_BYTES + 100,
    usage: 50,
  });

  await expect(assertAssetWriteAdmission(51, estimate)).rejects.toMatchObject({
    name: 'QuotaExceededError',
  });
  await expect(assertAssetWriteAdmission(50, estimate)).resolves.toBeUndefined();
});

it('accounts for aggregate in-flight bytes across sources', () => {
  const reservation = createAggregateAssetReservation(3);
  reservation.reserve(2);
  expect(() => reservation.reserve(2)).toThrow('aggregate reservation');
  reservation.release(1);
  reservation.reserve(2);
  expect(reservation.getReservedBytes()).toBe(3);
});
