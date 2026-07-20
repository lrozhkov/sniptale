import { expect, it, vi } from 'vitest';

const { reconcileCaptureJobsUseCaseMock } = vi.hoisted(() => ({
  reconcileCaptureJobsUseCaseMock: vi.fn(),
}));

vi.mock('./application/reconcile-capture-jobs-use-case', () => ({
  reconcileCaptureJobsUseCase: reconcileCaptureJobsUseCaseMock,
}));

import { reconcileCaptureJobsOnStartup } from './lifecycle';

it('exposes capture job reconciliation through the lifecycle facade', async () => {
  const options = {
    cleanupInterruptedCapture: vi.fn(async () => undefined),
    reconcileExportingDownload: vi.fn(async () => 'rebound' as const),
  };
  reconcileCaptureJobsUseCaseMock.mockResolvedValueOnce({
    activeFailed: 0,
    downloadsReconciled: 1,
    staleRemoved: 0,
  });

  await expect(reconcileCaptureJobsOnStartup(options)).resolves.toEqual({
    activeFailed: 0,
    downloadsReconciled: 1,
    staleRemoved: 0,
  });
  expect(reconcileCaptureJobsUseCaseMock).toHaveBeenCalledWith(options);
});
