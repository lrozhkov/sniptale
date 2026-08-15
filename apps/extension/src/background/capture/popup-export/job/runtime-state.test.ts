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
  writePopupExportJobStatus: mocks.write,
}));

import {
  appendPopupExportJobWarning,
  clonePopupExportJobStatus,
  popupExportJobErrorText,
  publishPopupExportJobStatus,
  updatePopupExportJobStatus,
  type ActivePopupExportJob,
} from './runtime-state';

function createJob(): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: false,
    contentPort: {
      cancelPagePackage: vi.fn(),
      requestPagePackage: vi.fn(),
    },
    completion: null,
    expectedActivation: null,
    lastActivatedByWindow: new Map(),
    manualActivationConflict: false,
    publicationQueue: Promise.resolve(),
    status: {
      activatedTabIds: [],
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
      jobId: 'job-1',
      orderedTabs: [{ tabId: 7, title: 'Page' }],
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
  await updatePopupExportJobStatus(job, { phase: 'cancelling' });

  expect(job.status.revision).toBe(2);
  expect(mocks.write).toHaveBeenCalledWith(job.status);
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({ status: expect.not.objectContaining({ revision: 1 }) })
  );
  expect(clonePopupExportJobStatus(job.status)).not.toBe(job.status);
});

it('keeps status persistence successful when no popup receives the update', async () => {
  const job = createJob();
  mocks.send.mockRejectedValueOnce(new Error('popup closed'));
  await expect(publishPopupExportJobStatus(job)).resolves.toBeUndefined();
  expect(mocks.write).toHaveBeenCalledOnce();
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

  const first = updatePopupExportJobStatus(job, { phase: 'cancelling' });
  const second = updatePopupExportJobStatus(job, { phase: 'cancelled' });
  await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
  expect(mocks.write.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ revision: 2 }));
  releaseFirstWrite();
  await Promise.all([first, second]);

  expect(mocks.write.mock.calls.map(([status]) => status.revision)).toEqual([2, 3]);
  expect(mocks.write.mock.calls.map(([status]) => status.phase)).toEqual([
    'cancelling',
    'cancelled',
  ]);
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
