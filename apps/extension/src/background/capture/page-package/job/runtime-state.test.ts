import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), write: vi.fn() }));

vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.send }),
}));
vi.mock('./storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storage')>()),
  writePagePackageJobStatus: mocks.write,
}));

import {
  admitPopupExportJobCancellation,
  appendPopupExportJobWarning,
  completePagePackageJobStatus,
  popupExportJobErrorText,
  publishPagePackageJobStatus,
  readDurablePagePackageJobStatus,
  updatePagePackageJobStatus,
  type ActivePopupExportJob,
} from './runtime-state';
import { clonePagePackageJobStatus } from './status';

function createJob(): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: false,
    cancellationCleanupComplete: false,
    cancellationCleanupError: null,
    cancellationQueue: Promise.resolve(),
    contentPort: {
      cancelPagePackage: vi.fn(),
      requestPagePackage: vi.fn(),
    },
    completion: null,
    finishCancellation: null,
    expectedActivation: null,
    lastActivatedByWindow: new Map(),
    manualActivationConflict: false,
    publicationQueue: Promise.resolve(),
    status: {
      activatedTabIds: [],
      intent: 'export',
      effectiveOptions: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: true,
        includeFullPageScreenshot: false,
        includeImages: true,
        includeJson: true,
        includeMarkdown: true,
        includePageDiagnostics: false,
      },
      effectiveComponentPlan: {
        components: {
          attachments: true,
          diagnostics: false,
          images: true,
          pageData: true,
          webCopy: false,
        },
        diagnosticsLevel: 'none',
        includeScreenshot: false,
      },
      jobId: 'job-1',
      orderedTabs: [{ tabId: 7, title: 'Page' }],
      pageOutcomes: [{ ordinal: 0, status: 'pending', tabId: 7 }],
      originalActiveTabs: [],
      phase: 'running',
      progress: { current: 0, errors: [], message: 'Running', phase: 'scanning', total: 1 },
      revision: 1,
      warnings: [],
    },
    unsubscribeActivation: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue(undefined);
  mocks.write.mockResolvedValue(undefined);
});

it('persists revisioned status and publishes an isolated update', async () => {
  const job = createJob();
  await updatePagePackageJobStatus(job, { phase: 'cancelling' });

  expect(job.status.revision).toBe(2);
  expect(mocks.write).toHaveBeenCalledWith(job.status);
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({ status: expect.not.objectContaining({ revision: 1 }) })
  );
  expect(clonePagePackageJobStatus(job.status)).not.toBe(job.status);
});

it('keeps status persistence successful when no popup receives the update', async () => {
  const job = createJob();
  mocks.send.mockRejectedValueOnce(new Error('popup closed'));
  await expect(publishPagePackageJobStatus(job)).resolves.toBeUndefined();
  expect(mocks.write).toHaveBeenCalledOnce();
});

it('does not expose the initial active status before its durable write commits', async () => {
  const job = createJob();
  let releaseWrite!: () => void;
  mocks.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        releaseWrite = resolve;
      })
  );

  const publication = publishPagePackageJobStatus(job);
  await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
  expect(readDurablePagePackageJobStatus(job)).toBeNull();
  releaseWrite();
  await publication;
  expect(readDurablePagePackageJobStatus(job)).toMatchObject({ revision: 1 });
});

it('serializes immutable publications in monotonically increasing revision order', async () => {
  const job = createJob();
  let releaseFirstWrite!: () => void;
  mocks.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      })
  );

  const first = updatePagePackageJobStatus(job, { phase: 'cancelling' });
  const second = updatePagePackageJobStatus(job, { phase: 'cancelled' });
  await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
  expect(job.status).toMatchObject({ phase: 'running', revision: 1 });
  expect(mocks.write.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ revision: 2 }));
  releaseFirstWrite();
  await Promise.all([first, second]);

  expect(mocks.write.mock.calls.map(([status]) => status.revision)).toEqual([2, 3]);
  expect(mocks.write.mock.calls.map(([status]) => status.phase)).toEqual([
    'cancelling',
    'cancelled',
  ]);
});

it('linearizes cancellation admission against terminal completion without deleting completed output', async () => {
  const cancelledFirst = createJob();
  const cancellation = admitPopupExportJobCancellation(cancelledFirst);
  const completion = completePagePackageJobStatus(cancelledFirst, {
    phase: 'completed',
    progress: { current: 1, errors: [], message: 'Done', phase: 'done', total: 1 },
  });

  await expect(cancellation).resolves.toBe(true);
  await expect(completion).resolves.toBe(false);
  expect(cancelledFirst.status.phase).toBe('cancelling');
  expect(cancelledFirst.abortController.signal.aborted).toBe(true);

  const completedFirst = createJob();
  let releaseCompletedWrite!: () => void;
  mocks.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        releaseCompletedWrite = resolve;
      })
  );
  const terminal = completePagePackageJobStatus(completedFirst, {
    phase: 'completed',
    progress: { current: 1, errors: [], message: 'Done', phase: 'done', total: 1 },
  });
  await vi.waitFor(() => expect(mocks.write).toHaveBeenCalled());
  const lateCancellation = admitPopupExportJobCancellation(completedFirst);
  releaseCompletedWrite();

  await expect(terminal).resolves.toBe(true);
  await expect(lateCancellation).resolves.toBe(false);
  expect(completedFirst.status.phase).toBe('completed');
  expect(completedFirst.abortController.signal.aborted).toBe(false);
});

it('keeps the last durable revision after a failed write and does not skip history', async () => {
  const job = createJob();
  mocks.write.mockRejectedValueOnce(new Error('session write failed'));

  await expect(updatePagePackageJobStatus(job, { phase: 'cancelling' })).rejects.toThrow(
    'session write failed'
  );
  expect(job.status).toMatchObject({ phase: 'running', revision: 1 });
  expect(readDurablePagePackageJobStatus(job)).toBeNull();

  await updatePagePackageJobStatus(job, { phase: 'cancelled' });
  expect(job.status).toMatchObject({ phase: 'cancelled', revision: 2 });
  expect(mocks.write.mock.calls.map(([status]) => status.revision)).toEqual([2, 2]);
});

it('deduplicates warnings through immutable revisioned updates and normalizes thrown values', async () => {
  const job = createJob();
  const initialWarnings = job.status.warnings;
  await appendPopupExportJobWarning(job, 'warning');
  await appendPopupExportJobWarning(job, 'warning');
  expect(job.status.warnings).toEqual(['warning']);
  expect(job.status.warnings).not.toBe(initialWarnings);
  expect(job.status.revision).toBe(2);
  expect(popupExportJobErrorText(new Error('failed'))).toBe('failed');
  expect(popupExportJobErrorText('failed')).toBe('failed');
});

it('does not let dynamic warnings overflow the durable aggregate budget', async () => {
  const job = createJob();
  job.status.warnings = Array.from({ length: 32 }, () => 'x'.repeat(16 * 1024));

  await appendPopupExportJobWarning(job, 'overflow');

  expect(job.status.warnings).toHaveLength(32);
  expect(mocks.write).not.toHaveBeenCalled();
});
