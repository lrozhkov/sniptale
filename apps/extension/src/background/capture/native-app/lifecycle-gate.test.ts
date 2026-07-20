import { expect, it } from 'vitest';

import {
  acquireNativeIngestionPermit,
  reserveNativeIngestionErasureExclusion,
} from './lifecycle-gate';

it('drains every active permit and makes permit and exclusion release idempotent', async () => {
  const releaseFirst = acquireNativeIngestionPermit();
  const releaseSecond = acquireNativeIngestionPermit();
  expect(releaseFirst).not.toBeNull();
  expect(releaseSecond).not.toBeNull();
  const exclusion = reserveNativeIngestionErasureExclusion();
  let drained = false;
  void exclusion.waitForActiveMutations().then(() => {
    drained = true;
  });

  releaseFirst?.();
  releaseFirst?.();
  await Promise.resolve();
  expect(drained).toBe(false);
  releaseSecond?.();
  await exclusion.waitForActiveMutations();
  expect(drained).toBe(true);
  expect(acquireNativeIngestionPermit()).toBeNull();

  exclusion.release();
  exclusion.release();
  const releaseAfter = acquireNativeIngestionPermit();
  expect(releaseAfter).not.toBeNull();
  releaseAfter?.();
  releaseAfter?.();
});
