import { expect, it } from 'vitest';

import { acquireMediaMutationPermit, reserveMediaErasureExclusion } from './lifecycle-gate';

it('blocks new starts immediately and waits for already admitted starts to finish', async () => {
  const releaseExistingStart = acquireMediaMutationPermit();
  expect(releaseExistingStart).not.toBeNull();
  const exclusion = reserveMediaErasureExclusion();

  expect(acquireMediaMutationPermit()).toBeNull();
  let drained = false;
  void exclusion.waitForActiveMutations().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  releaseExistingStart?.();
  await exclusion.waitForActiveMutations();
  exclusion.release();

  const nextStart = acquireMediaMutationPermit();
  expect(nextStart).not.toBeNull();
  nextStart?.();
});

it('keeps starts excluded across independently reserved erasure transactions', async () => {
  const first = reserveMediaErasureExclusion();
  const second = reserveMediaErasureExclusion();

  expect(acquireMediaMutationPermit()).toBeNull();
  first.release();
  expect(acquireMediaMutationPermit()).toBeNull();
  second.release();

  const nextStart = acquireMediaMutationPermit();
  expect(nextStart).not.toBeNull();
  nextStart?.();
});

it('drains every concurrent start and makes permit release idempotent', async () => {
  const releaseFirst = acquireMediaMutationPermit();
  const releaseSecond = acquireMediaMutationPermit();
  const exclusion = reserveMediaErasureExclusion();

  releaseFirst?.();
  releaseFirst?.();
  let drained = false;
  void exclusion.waitForActiveMutations().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);

  releaseSecond?.();
  await exclusion.waitForActiveMutations();
  exclusion.release();
});

it('makes exclusion release idempotent', () => {
  const exclusion = reserveMediaErasureExclusion();
  exclusion.release();
  exclusion.release();

  const nextStart = acquireMediaMutationPermit();
  expect(nextStart).not.toBeNull();
  nextStart?.();
});
