import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cleanupLibrary: vi.fn(),
  interrupt: vi.fn(),
  read: vi.fn(),
  reconcile: vi.fn(),
  reconcileJournals: vi.fn(),
}));

vi.mock('./library', () => ({
  cleanupRecordedPagePackageLibraryAssets: mocks.cleanupLibrary,
  saveCollectedPagePackages: vi.fn(),
}));

vi.mock('./download-effect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./download-effect')>()),
  reconcileAndCleanupPagePackageOutput: mocks.reconcile,
}));
vi.mock('./storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storage')>()),
  interruptStoredPopupExportJob: mocks.interrupt,
  readPagePackageJobRecoveryState: mocks.read,
  reconcileUnmatchedPagePackageJobJournals: mocks.reconcileJournals,
}));

import { recoverInterruptedPagePackageJob } from './recovery';
import { acquirePopupExportMutationPermit } from './lifecycle-gate';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.interrupt.mockResolvedValue(undefined);
  mocks.cleanupLibrary.mockResolvedValue(undefined);
  mocks.reconcile.mockResolvedValue(undefined);
  mocks.reconcileJournals.mockResolvedValue(undefined);
});

it('reconciles output and staged authorities before completing restart recovery', async () => {
  mocks.read.mockResolvedValue({ jobId: 'job-1', output: {}, stagedPages: [], status: {} });

  await recoverInterruptedPagePackageJob();

  expect(mocks.reconcileJournals).toHaveBeenCalledOnce();
  expect(mocks.reconcile).toHaveBeenCalledWith('job-1', {});
  expect(mocks.cleanupLibrary).toHaveBeenCalledWith('job-1');
  expect(mocks.interrupt).toHaveBeenCalledWith('job-1');
});

it('retains and surfaces either independently failed cleanup authority', async () => {
  mocks.read.mockResolvedValue({ jobId: 'job-1', output: {}, stagedPages: [], status: {} });
  mocks.reconcile.mockRejectedValueOnce(new Error('ambiguous browser effect'));
  mocks.interrupt.mockRejectedValueOnce(new Error('staged cleanup failed'));

  await expect(recoverInterruptedPagePackageJob()).rejects.toThrow(
    'restart reconciliation is incomplete'
  );
  expect(mocks.reconcile).toHaveBeenCalledOnce();
  expect(mocks.interrupt).toHaveBeenCalledOnce();
});

it('blocks new admission from the recovery read until exact job-bound cleanup completes', async () => {
  let finishRead!: (value: {
    jobId: string;
    output: null;
    stagedPages: [];
    status: object;
  }) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      })
  );

  const recovery = recoverInterruptedPagePackageJob();
  await vi.waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  expect(acquirePopupExportMutationPermit()).toBeNull();
  finishRead({ jobId: 'old-job', output: null, stagedPages: [], status: {} });
  await recovery;

  expect(mocks.interrupt).toHaveBeenCalledWith('old-job');
  const nextAdmission = acquirePopupExportMutationPermit();
  expect(nextAdmission).not.toBeNull();
  nextAdmission?.();
});
