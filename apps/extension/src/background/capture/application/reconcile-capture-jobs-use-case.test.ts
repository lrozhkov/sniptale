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

  const cleanupPendingFullPageCapture = vi.fn(async () => undefined);
  await expect(
    reconcileCaptureJobsUseCase(options, reconcile, cleanupPendingFullPageCapture)
  ).resolves.toEqual({
    activeFailed: 1,
    downloadsReconciled: 2,
    staleRemoved: 3,
  });
  expect(reconcile).toHaveBeenCalledWith(options);
  expect(cleanupPendingFullPageCapture).toHaveBeenCalledOnce();
});

it('still reconciles jobs when a retained full-page lease needs another startup retry', async () => {
  const reconcile: ReconcileCaptureJobsPort = vi.fn(async () => ({
    activeFailed: 0,
    downloadsReconciled: 0,
    staleRemoved: 0,
  }));
  const cleanupPendingFullPageCapture = vi
    .fn()
    .mockRejectedValue(new Error('debugger detach still pending'));
  const options = {
    cleanupInterruptedCapture: vi.fn(async () => undefined),
    reconcileExportingDownload: vi.fn(async () => 'rebound' as const),
  };

  await expect(
    reconcileCaptureJobsUseCase(options, reconcile, cleanupPendingFullPageCapture)
  ).resolves.toEqual({ activeFailed: 0, downloadsReconciled: 0, staleRemoved: 0 });
  expect(cleanupPendingFullPageCapture).toHaveBeenCalledOnce();
  expect(reconcile).toHaveBeenCalledWith(options);
});
