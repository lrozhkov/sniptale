import { expect, it, vi } from 'vitest';
import {
  acquirePopupExportMutationPermit,
  reservePopupExportErasureExclusion,
} from './lifecycle-gate';

it('drains admitted work and blocks new jobs while privacy erasure owns the exclusion', async () => {
  const releaseMutation = acquirePopupExportMutationPermit();
  expect(releaseMutation).not.toBeNull();
  const exclusion = reservePopupExportErasureExclusion();
  const drained = vi.fn();
  void exclusion.waitForActiveMutations().then(drained);

  expect(acquirePopupExportMutationPermit()).toBeNull();
  await Promise.resolve();
  expect(drained).not.toHaveBeenCalled();
  releaseMutation?.();
  await vi.waitFor(() => expect(drained).toHaveBeenCalledOnce());

  exclusion.release();
  acquirePopupExportMutationPermit()?.();
});
