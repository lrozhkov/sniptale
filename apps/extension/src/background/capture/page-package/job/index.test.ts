import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PagePackageJobStatusV1 } from './status';

const mocks = vi.hoisted(() => ({
  admit: vi.fn(),
  cancelCapture: vi.fn(),
  cleanupCancellation: vi.fn(),
  clearStatus: vi.fn(),
  execute: vi.fn(),
  hasResources: vi.fn(),
  loadSettings: vi.fn(),
  publish: vi.fn(),
  readDurable: vi.fn(),
  readStatus: vi.fn(),
  recover: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./execute', () => ({ executePopupExportJob: mocks.execute }));
vi.mock('./runtime-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-state')>()),
  publishPagePackageJobStatus: mocks.publish,
  readDurablePagePackageJobStatus: mocks.readDurable,
  updatePagePackageJobStatus: mocks.update,
  admitPopupExportJobCancellation: mocks.admit,
}));
vi.mock('./cancellation', () => ({
  cancelPagePackageJobCaptureAuthorities: mocks.cancelCapture,
  cleanupPopupExportJobCancellation: mocks.cleanupCancellation,
}));
vi.mock('./storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storage')>()),
  clearPagePackageJobStatus: mocks.clearStatus,
  hasUnresolvedPagePackageResources: mocks.hasResources,
  readPagePackageJobStatus: mocks.readStatus,
}));
vi.mock('./recovery', () => ({ recoverInterruptedPagePackageJob: mocks.recover }));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));

import {
  acknowledgePagePackageJobStatus,
  assertActivePopupExportStageBinding,
  cancelPagePackageJob,
  erasePopupExportJobState,
  getPagePackageJobStatus,
  startPagePackageJob,
} from './index';
import type { ActivePopupExportJob } from './runtime-state';

const options = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: false,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
  includePageDiagnostics: false,
};

const tabs = [
  { tabId: 11, title: 'One' },
  { tabId: 12, title: 'Two' },
];

function createStoredStatus(
  phase: PagePackageJobStatusV1['phase'],
  jobId = 'stored-job'
): PagePackageJobStatusV1 {
  return {
    activatedTabIds: [],
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
    effectiveOptions: options,
    jobId,
    intent: 'export',
    orderedTabs: [{ tabId: 21, title: 'Stored' }],
    pageOutcomes: [{ ordinal: 0, status: 'succeeded', tabId: 21 }],
    originalActiveTabs: [],
    phase,
    progress: { current: 1, errors: [], message: phase, phase: 'done', total: 1 },
    revision: 3,
    warnings: [],
  };
}

function createExecutionControl() {
  let activeJob!: ActivePopupExportJob;
  let finish!: () => void;
  const settled = new Promise<void>((resolve) => {
    mocks.execute.mockImplementationOnce(async (job, onFinished) => {
      activeJob = job;
      await new Promise<void>((resolveExecution) => {
        finish = () => {
          onFinished();
          resolveExecution();
          resolve();
        };
      });
    });
  });
  return {
    get activeJob() {
      return activeJob;
    },
    finish: () => finish(),
    settled,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.clearStatus.mockResolvedValue(true);
  mocks.publish.mockResolvedValue(undefined);
  mocks.readDurable.mockReturnValue(null);
  mocks.hasResources.mockResolvedValue(false);
  mocks.loadSettings.mockResolvedValue({ webSnapshotEnabled: true });
  mocks.readStatus.mockResolvedValue(null);
  mocks.recover.mockResolvedValue(undefined);
  mocks.update.mockImplementation(async (job: ActivePopupExportJob, patch) => {
    job.status = { ...job.status, ...patch, revision: job.status.revision + 1 };
  });
  mocks.admit.mockImplementation(async (job: ActivePopupExportJob) => {
    if (job.status.phase !== 'running' && job.status.phase !== 'cancelling') return false;
    job.cancelled = true;
    job.abortController.abort();
    if (job.status.phase === 'running') await mocks.update(job, { phase: 'cancelling' });
    return true;
  });
  mocks.cleanupCancellation.mockImplementation(async (job: ActivePopupExportJob) => {
    await Promise.all(
      job.status.orderedTabs.map((tab) =>
        job.contentPort.cancelPagePackage({ exportRunId: job.status.jobId, tabId: tab.tabId })
      )
    );
    job.cancellationCleanupComplete = true;
    job.cancellationCleanupError = null;
  });
  mocks.cancelCapture.mockImplementation(async (job: ActivePopupExportJob) => {
    await Promise.all(
      job.status.orderedTabs.map((tab) =>
        job.contentPort.cancelPagePackage({ exportRunId: job.status.jobId, tabId: tab.tabId })
      )
    );
  });
});

afterEach(async () => {
  await erasePopupExportJobState();
});

it('admits one active job and binds staging to its exact job, ordinal, and tab', async () => {
  const execution = createExecutionControl();
  const contentPort = { cancelPagePackage: vi.fn(), requestPagePackage: vi.fn() };

  const status = await startPagePackageJob({
    contentPort,
    includeWebCopy: false,
    intent: 'export',
    jobId: 'job-1',
    options,
    orderedTabs: tabs,
    warnings: ['notice'],
  });

  expect(status).toEqual(
    expect.objectContaining({ jobId: 'job-1', orderedTabs: tabs, phase: 'running' })
  );
  expect(status).not.toBe(execution.activeJob.status);
  expect(() =>
    assertActivePopupExportStageBinding({ jobId: 'job-1', ordinal: 1, tabId: 12 })
  ).not.toThrow();
  expect(() =>
    assertActivePopupExportStageBinding({ jobId: 'job-1', ordinal: 1, tabId: 11 })
  ).toThrow('not bound');
  expect(() =>
    assertActivePopupExportStageBinding({ jobId: 'other-job', ordinal: 1, tabId: 12 })
  ).toThrow('not bound');
  await expect(
    startPagePackageJob({
      contentPort,
      includeWebCopy: false,
      intent: 'export',
      jobId: 'job-2',
      options,
      orderedTabs: tabs,
      warnings: [],
    })
  ).rejects.toThrow('already active');

  execution.finish();
  await execution.settled;
  expect(() =>
    assertActivePopupExportStageBinding({ jobId: 'job-1', ordinal: 1, tabId: 12 })
  ).toThrow('not bound');
});

it('normalizes direct producer titles and rejects an over-limit direct tab graph', async () => {
  const execution = createExecutionControl();
  await startPagePackageJob({
    contentPort: { cancelPagePackage: vi.fn(), requestPagePackage: vi.fn() },
    includeWebCopy: false,
    intent: 'export',
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 11, title: '\ud83d\ude00'.repeat(2_000) }],
    warnings: [],
  });

  expect(
    new TextEncoder().encode(execution.activeJob.status.orderedTabs[0]!.title).byteLength
  ).toBe(2 * 1024);
  execution.finish();
  await execution.settled;

  await expect(
    startPagePackageJob({
      contentPort: { cancelPagePackage: vi.fn(), requestPagePackage: vi.fn() },
      includeWebCopy: false,
      intent: 'export',
      jobId: 'job-2',
      options,
      orderedTabs: Array.from({ length: 257 }, (_, tabId) => ({ tabId, title: 'Page' })),
      warnings: [],
    })
  ).rejects.toThrow('supported tab count');
});

it('rejects duplicate direct tab identities before settings, persistence, or producer effects', async () => {
  const contentPort = { cancelPagePackage: vi.fn(), requestPagePackage: vi.fn() };

  await expect(
    startPagePackageJob({
      contentPort,
      includeWebCopy: true,
      intent: 'save',
      jobId: 'job-duplicate',
      options: { ...options, includeFullPageScreenshot: true },
      orderedTabs: [
        { tabId: 11, title: 'One' },
        { tabId: 11, title: 'Duplicate' },
      ],
      warnings: [],
    })
  ).rejects.toThrow('must be unique');

  expect(mocks.loadSettings).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(contentPort.requestPagePackage).not.toHaveBeenCalled();
});

it('checks Save consent before claiming a job and derives its component plan', async () => {
  const contentPort = { cancelPagePackage: vi.fn(), requestPagePackage: vi.fn() };
  mocks.loadSettings.mockResolvedValueOnce({ webSnapshotEnabled: false });
  await expect(
    startPagePackageJob({
      contentPort,
      includeWebCopy: true,
      intent: 'save',
      jobId: 'job-disabled',
      options: { ...options, includeFullPageScreenshot: true },
      orderedTabs: tabs,
      warnings: [],
    })
  ).rejects.toThrow('disabled');
  expect(mocks.execute).not.toHaveBeenCalled();

  await expect(
    startPagePackageJob({
      contentPort,
      includeWebCopy: true,
      intent: 'save',
      jobId: 'job-extended-save',
      options: {
        ...options,
        includeFullPageScreenshot: true,
        includePageDiagnostics: true,
      },
      orderedTabs: tabs,
      warnings: [],
    })
  ).rejects.toThrow('only for direct export');
  expect(mocks.publish).not.toHaveBeenCalled();

  const execution = createExecutionControl();
  await startPagePackageJob({
    contentPort,
    includeWebCopy: true,
    intent: 'save',
    jobId: 'job-save',
    options: { ...options, includeFullPageScreenshot: true },
    orderedTabs: tabs,
    warnings: [],
  });
  expect(execution.activeJob.status).toMatchObject({
    effectiveComponentPlan: {
      components: {
        attachments: true,
        diagnostics: false,
        images: true,
        pageData: true,
        webCopy: true,
      },
      diagnosticsLevel: 'none',
      includeScreenshot: true,
    },
  });
  execution.finish();
  await execution.settled;
});

it('cancels the active job before asking every selected content runtime to stop', async () => {
  const execution = createExecutionControl();
  const cancelPagePackage = vi.fn().mockResolvedValue(undefined);
  await startPagePackageJob({
    contentPort: { cancelPagePackage, requestPagePackage: vi.fn() },
    includeWebCopy: false,
    intent: 'export',
    jobId: 'job-1',
    options,
    orderedTabs: tabs,
    warnings: [],
  });

  const cancellation = cancelPagePackageJob('job-1');
  await vi.waitFor(() => expect(cancelPagePackage).toHaveBeenCalledTimes(2));
  execution.finish();
  const status = await cancellation;

  expect(execution.activeJob.cancelled).toBe(true);
  expect(execution.activeJob.abortController.signal.aborted).toBe(true);
  expect(status.phase).toBe('cancelling');
  expect(cancelPagePackage.mock.calls).toEqual([
    [{ exportRunId: 'job-1', tabId: 11 }],
    [{ exportRunId: 'job-1', tabId: 12 }],
  ]);
  expect(() =>
    assertActivePopupExportStageBinding({ jobId: 'job-1', ordinal: 0, tabId: 11 })
  ).toThrow('not bound');

  await execution.settled;
});

it('keeps failed cancellation cleanup retryable until every tab is clean', async () => {
  const execution = createExecutionControl();
  const cancelPagePackage = vi.fn().mockResolvedValue(undefined);
  await startPagePackageJob({
    contentPort: { cancelPagePackage, requestPagePackage: vi.fn() },
    includeWebCopy: true,
    intent: 'save',
    jobId: 'job-retry-cancel',
    options: { ...options, includeFullPageScreenshot: true },
    orderedTabs: tabs,
    warnings: [],
  });
  const finishCancellation = vi.fn();
  execution.activeJob.cancelled = true;
  execution.activeJob.cancellationCleanupError = new Error('delete unavailable');
  execution.activeJob.finishCancellation = finishCancellation;
  execution.activeJob.status.phase = 'cancelling';

  const status = await cancelPagePackageJob('job-retry-cancel');

  expect(cancelPagePackage).toHaveBeenCalledTimes(2);
  expect(execution.activeJob.cancellationCleanupError).toBeNull();
  expect(status.phase).toBe('cancelled');
  expect(finishCancellation).toHaveBeenCalledOnce();
  execution.finish();
  await execution.settled;
});

it('exposes only the committed durable projection while a job is active', async () => {
  const execution = createExecutionControl();
  await startPagePackageJob({
    contentPort: { cancelPagePackage: vi.fn(), requestPagePackage: vi.fn() },
    includeWebCopy: false,
    intent: 'export',
    jobId: 'job-1',
    options,
    orderedTabs: tabs,
    warnings: [],
  });

  await expect(getPagePackageJobStatus('job-1')).resolves.toBeNull();
  await expect(acknowledgePagePackageJobStatus('job-1')).resolves.toBeNull();
  const durable = createStoredStatus('running', 'job-1');
  mocks.readDurable.mockReturnValue(durable);
  const projected = structuredClone(durable);
  await expect(getPagePackageJobStatus()).resolves.toEqual(projected);
  await expect(getPagePackageJobStatus('other-job')).resolves.toBeNull();
  await expect(acknowledgePagePackageJobStatus('job-1')).resolves.toEqual(structuredClone(durable));
  expect(mocks.readStatus).not.toHaveBeenCalled();

  execution.finish();
  await execution.settled;
});

it('reads an isolated status and acknowledges only matching terminal storage', async () => {
  const stored = createStoredStatus('completed');
  const popupStored = structuredClone(stored);
  mocks.readStatus.mockResolvedValue(stored);

  const status = await getPagePackageJobStatus('stored-job');
  expect(status).toEqual(popupStored);
  expect(status).not.toBe(stored);
  await expect(acknowledgePagePackageJobStatus('other-job')).resolves.toEqual(popupStored);
  expect(mocks.clearStatus).not.toHaveBeenCalled();

  mocks.hasResources.mockResolvedValueOnce(true);
  mocks.recover.mockRejectedValueOnce(new Error('cleanup remains incomplete'));
  await expect(acknowledgePagePackageJobStatus('stored-job')).resolves.toEqual(popupStored);
  expect(mocks.clearStatus).not.toHaveBeenCalled();

  mocks.hasResources.mockResolvedValue(false);
  mocks.hasResources.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(acknowledgePagePackageJobStatus('stored-job')).resolves.toBeNull();
  expect(mocks.clearStatus).toHaveBeenCalledOnce();
  expect(mocks.clearStatus).toHaveBeenCalledWith('stored-job');
  expect(mocks.recover).toHaveBeenCalledWith({ allowAbsentDownloadCleanup: true });

  mocks.clearStatus.mockClear();
  mocks.readStatus.mockResolvedValue(createStoredStatus('running'));
  await expect(acknowledgePagePackageJobStatus('stored-job')).resolves.toEqual(
    expect.objectContaining({ phase: 'running' })
  );
  expect(mocks.clearStatus).not.toHaveBeenCalled();
});

it('does not let a stale acknowledgement clear a replacement job', async () => {
  const oldStatus = createStoredStatus('completed', 'old-job');
  const replacement = createStoredStatus('running', 'new-job');
  mocks.readStatus.mockResolvedValueOnce(oldStatus).mockResolvedValueOnce(replacement);
  mocks.clearStatus.mockResolvedValueOnce(false);

  await expect(acknowledgePagePackageJobStatus('old-job')).resolves.toEqual(
    structuredClone(replacement)
  );

  expect(mocks.clearStatus).toHaveBeenCalledWith('old-job');
});

it('reports absent persisted jobs and rejects cancellation without an exact active owner', async () => {
  await expect(getPagePackageJobStatus('missing-job')).resolves.toBeNull();
  await expect(acknowledgePagePackageJobStatus('missing-job')).resolves.toBeNull();
  await expect(cancelPagePackageJob('missing-job')).rejects.toThrow(
    'Popup export job is not active'
  );
});

it('erasure aborts an active job, waits for it, and clears persisted state', async () => {
  const execution = createExecutionControl();
  const cancelPagePackage = vi.fn().mockResolvedValue(undefined);
  await startPagePackageJob({
    contentPort: { cancelPagePackage, requestPagePackage: vi.fn() },
    includeWebCopy: false,
    intent: 'export',
    jobId: 'job-1',
    options,
    orderedTabs: tabs,
    warnings: [],
  });

  const erasure = erasePopupExportJobState();
  await vi.waitFor(() => expect(cancelPagePackage).toHaveBeenCalledTimes(2));
  expect(execution.activeJob.abortController.signal.aborted).toBe(true);
  expect(mocks.clearStatus).not.toHaveBeenCalled();
  execution.finish();
  await erasure;
  expect(mocks.recover).toHaveBeenCalledWith({
    allowAbsentDownloadCleanup: true,
    cancelActiveDownload: true,
  });
  expect(mocks.clearStatus).toHaveBeenCalledOnce();
  expect(mocks.clearStatus).toHaveBeenCalledWith('job-1');
});
