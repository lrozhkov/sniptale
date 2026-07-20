import { expect, it } from 'vitest';

import {
  acquireDiagnosticsMutationPermit,
  reserveDiagnosticsErasureExclusion,
  runWithDiagnosticsMutationPermit,
} from './lifecycle-gate';

it('drains admitted writers and rejects late diagnostics persistence', async () => {
  const releaseWriter = acquireDiagnosticsMutationPermit();
  expect(releaseWriter).not.toBeNull();
  const exclusion = reserveDiagnosticsErasureExclusion();

  expect(acquireDiagnosticsMutationPermit()).toBeNull();
  let drained = false;
  void exclusion.waitForActiveMutations().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);

  releaseWriter?.();
  await exclusion.waitForActiveMutations();
  exclusion.release();
});

it('keeps admission closed until every queued erasure releases its reservation', () => {
  const first = reserveDiagnosticsErasureExclusion();
  const second = reserveDiagnosticsErasureExclusion();

  first.release();
  expect(acquireDiagnosticsMutationPermit()).toBeNull();
  second.release();

  const releaseWriter = acquireDiagnosticsMutationPermit();
  expect(releaseWriter).not.toBeNull();
  releaseWriter?.();
});

it('makes writer and exclusion release idempotent', async () => {
  const releaseWriter = acquireDiagnosticsMutationPermit();
  const exclusion = reserveDiagnosticsErasureExclusion();

  releaseWriter?.();
  releaseWriter?.();
  await exclusion.waitForActiveMutations();
  exclusion.release();
  exclusion.release();
});

it('runs admitted diagnostics mutations and releases after operation failure', async () => {
  await expect(runWithDiagnosticsMutationPermit(async () => 'complete', 'blocked')).resolves.toBe(
    'complete'
  );
  await expect(
    runWithDiagnosticsMutationPermit(async () => {
      throw new Error('operation failed');
    }, 'blocked')
  ).rejects.toThrow('operation failed');

  const releaseWriter = acquireDiagnosticsMutationPermit();
  expect(releaseWriter).not.toBeNull();
  releaseWriter?.();
});

it('rejects diagnostics mutation operations while exclusion is pending', async () => {
  const exclusion = reserveDiagnosticsErasureExclusion();
  let called = false;

  await expect(
    runWithDiagnosticsMutationPermit(async () => {
      called = true;
    }, 'diagnostics erasure pending')
  ).rejects.toThrow('diagnostics erasure pending');
  expect(called).toBe(false);
  exclusion.release();
});
