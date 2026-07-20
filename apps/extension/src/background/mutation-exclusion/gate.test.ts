import { expect, it } from 'vitest';

import { createMutationExclusion } from './gate';

it('drains every active writer in release order and rejects late admission', async () => {
  const gate = createMutationExclusion();
  const releaseFirst = gate.acquirePermit();
  const releaseSecond = gate.acquirePermit();
  const exclusion = gate.reserveExclusion();
  let drained = false;
  void exclusion.waitForActiveMutations().then(() => {
    drained = true;
  });

  expect(gate.acquirePermit()).toBeNull();
  releaseFirst?.();
  await Promise.resolve();
  expect(drained).toBe(false);
  releaseSecond?.();
  await exclusion.waitForActiveMutations();
  expect(drained).toBe(true);
  exclusion.release();
});

it('keeps exclusion pending until every reservation releases idempotently', () => {
  const gate = createMutationExclusion();
  const first = gate.reserveExclusion();
  const second = gate.reserveExclusion();

  first.release();
  first.release();
  expect(gate.acquirePermit()).toBeNull();
  second.release();
  second.release();

  const release = gate.acquirePermit();
  expect(release).not.toBeNull();
  release?.();
  release?.();
});

it('supports a fresh mutation and drain cycle after release', async () => {
  const gate = createMutationExclusion();
  const firstRelease = gate.acquirePermit();
  firstRelease?.();
  const firstExclusion = gate.reserveExclusion();
  await firstExclusion.waitForActiveMutations();
  firstExclusion.release();

  const secondRelease = gate.acquirePermit();
  const secondExclusion = gate.reserveExclusion();
  secondRelease?.();
  await secondExclusion.waitForActiveMutations();
  secondExclusion.release();
});

it('creates independent mutation authorities', () => {
  const first = createMutationExclusion();
  const second = createMutationExclusion();
  const exclusion = first.reserveExclusion();

  expect(first.acquirePermit()).toBeNull();
  const secondRelease = second.acquirePermit();
  expect(secondRelease).not.toBeNull();

  secondRelease?.();
  exclusion.release();
});
