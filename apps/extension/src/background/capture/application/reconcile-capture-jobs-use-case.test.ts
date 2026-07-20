import { expect, it, vi } from 'vitest';

import { reconcileCaptureJobsUseCase } from './reconcile-capture-jobs-use-case';
import type { ReconcileCaptureJobsPort } from './ports';

it('delegates startup reconciliation through an injected port', async () => {
  const reconcile: ReconcileCaptureJobsPort = vi.fn(async () => ({
    activeFailed: 1,
    downloadsReconciled: 2,
    staleRemoved: 3,
  }));
  const options = {
    cleanupInterruptedCapture: vi.fn(async () => undefined),
    nowEpochMs: 123,
    reconcileExportingDownload: vi.fn(async () => 'rebound' as const),
  };

  await expect(reconcileCaptureJobsUseCase(options, reconcile)).resolves.toEqual({
    activeFailed: 1,
    downloadsReconciled: 2,
    staleRemoved: 3,
  });
  expect(reconcile).toHaveBeenCalledWith(options);
});
