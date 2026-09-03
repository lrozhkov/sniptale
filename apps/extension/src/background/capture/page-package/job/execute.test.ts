import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  complete: vi.fn(),
  cleanupCancellation: vi.fn(),
  download: vi.fn(),
  finishActionIndicator: vi.fn(),
  prepareDownloadRuntime: vi.fn(),
  save: vi.fn(),
  startActionIndicator: vi.fn(),
  release: vi.fn(),
  releaseOne: vi.fn(),
  resolveTabs: vi.fn(),
  restore: vi.fn(),
  subscribe: vi.fn(),
  cleanupTemporaryTabs: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./download')>()),
  downloadCollectedPagePackages: mocks.download,
  releaseCollectedPagePackage: mocks.releaseOne,
  releaseCollectedPagePackages: mocks.release,
}));
vi.mock('./offscreen-download-gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./offscreen-download-gateway')>()),
  preparePagePackageDownloadRuntime: mocks.prepareDownloadRuntime,
}));
vi.mock('./action-indicator', () => ({
  startPagePackageActionIndicator: mocks.startActionIndicator,
}));
vi.mock('./visible', () => ({
  activatePopupExportCaptureTarget: vi.fn(),
  resolvePopupExportTabsAndOriginals: mocks.resolveTabs,
  restorePopupExportOriginalTabs: mocks.restore,
  subscribeToPopupExportManualActivation: mocks.subscribe,
}));
vi.mock('./page-phase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./page-phase')>()),
  collectPopupExportPagePackages: mocks.collect,
}));
vi.mock('./library', () => ({
  cleanupRecordedPagePackageLibraryAssets: vi.fn(),
  saveCollectedPagePackages: mocks.save,
}));
vi.mock('./runtime-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-state')>()),
  updatePagePackageJobStatus: mocks.update,
  completePagePackageJobStatus: mocks.complete,
}));
vi.mock('./cancellation', () => ({
  cancelPagePackageJobCaptureAuthorities: vi.fn(),
  cleanupPopupExportJobCancellation: mocks.cleanupCancellation,
}));
vi.mock('./source-tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./source-tabs')>()),
  cleanupTemporaryPagePackageTabs: mocks.cleanupTemporaryTabs,
}));

import { executePopupExportJob } from './execute';
import type { ActivePopupExportJob } from './runtime-state';

const producerDescriptor = {
  producerStats: { filesCount: 3, filesFailed: 1, rowsCount: 5, sectionsCount: 2 },
};

function stagedItem(ordinal: number, tabId: number) {
  return {
    descriptor: {
      ...producerDescriptor,
      jobId: 'job-1',
      ordinal,
      stagedBlobId: `stage-${ordinal}`,
    },
    tab: { tabId, title: `Page ${ordinal}` },
  };
}

function createJob(): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: false,
    cancellationCleanupComplete: false,
    cancellationCleanupError: null,
    cancellationQueue: Promise.resolve(),
    completion: null,
    finishCancellation: null,
    contentPort: { cancelPagePackage: vi.fn(), requestPagePackage: vi.fn() },
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
      progress: { current: 0, errors: [], message: '', phase: 'scanning', total: 1 },
      revision: 1,
      warnings: [],
    },
    unsubscribeActivation: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.finishActionIndicator.mockResolvedValue(undefined);
  mocks.startActionIndicator.mockReturnValue(mocks.finishActionIndicator);
  mocks.cleanupTemporaryTabs.mockResolvedValue(undefined);
  mocks.resolveTabs.mockResolvedValue(new Map([[7, { id: 7 }]]));
  mocks.prepareDownloadRuntime.mockResolvedValue(undefined);
  mocks.collect.mockImplementation(async (job: ActivePopupExportJob, _tabs, onPackage) => {
    const packages = job.status.orderedTabs.map((tab, ordinal) => stagedItem(ordinal, tab.tabId));
    if (!onPackage) return { errors: [], packages };
    const errors: string[] = [];
    for (const item of packages) {
      if (job.cancelled) break;
      try {
        await onPackage(item);
        job.status.pageOutcomes[item.descriptor.ordinal] = {
          ordinal: item.descriptor.ordinal,
          status: 'succeeded',
          tabId: item.tab.tabId,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${item.tab.title}: ${message}`);
        job.status.pageOutcomes[item.descriptor.ordinal] = {
          error: message,
          ordinal: item.descriptor.ordinal,
          status: 'failed',
          tabId: item.tab.tabId,
        };
      }
    }
    return { errors, packages: [] };
  });
  mocks.download.mockResolvedValue({ filename: 'page-package.zip', pageCount: 1 });
  mocks.save.mockResolvedValue({ failures: [], snapshotIds: ['snapshot-1'] });
  mocks.release.mockResolvedValue(undefined);
  mocks.releaseOne.mockResolvedValue(undefined);
  mocks.cleanupCancellation.mockImplementation(async (job: ActivePopupExportJob) => {
    const results = await Promise.allSettled([
      ...job.status.orderedTabs.map((tab) =>
        job.contentPort.cancelPagePackage({ exportRunId: job.status.jobId, tabId: tab.tabId })
      ),
      mocks.release(job.status.jobId),
    ]);
    const failure = results.find((result) => result.status === 'rejected');
    if (!failure) {
      job.cancellationCleanupComplete = true;
      job.cancellationCleanupError = null;
    } else {
      const error = failure.reason as unknown;
      job.cancellationCleanupComplete = false;
      job.cancellationCleanupError = error;
      throw error;
    }
  });
  mocks.restore.mockResolvedValue(undefined);
  mocks.update.mockImplementation(async (job: ActivePopupExportJob, patch) => {
    job.status = {
      ...job.status,
      ...patch,
      ...(patch.progress ? { progress: { ...job.status.progress, ...patch.progress } } : {}),
    };
  });
  mocks.complete.mockImplementation(async (job: ActivePopupExportJob, patch) => {
    if (job.cancelled) return false;
    job.status = {
      ...job.status,
      ...patch,
      ...(patch.progress ? { progress: { ...job.status.progress, ...patch.progress } } : {}),
    };
    return true;
  });
});

it('opens the final result only after restoring and closing capture tabs', async () => {
  const sequence: string[] = [];
  const job = createJob();
  const onFinished = vi.fn(() => sequence.push('finished'));
  mocks.restore.mockImplementationOnce(async () => {
    sequence.push('restored-tabs');
  });
  mocks.cleanupTemporaryTabs.mockImplementationOnce(async () => {
    sequence.push('closed-temporary-tabs');
  });
  mocks.finishActionIndicator.mockImplementationOnce(async () => {
    sequence.push('opened-final-popup');
  });

  await executePopupExportJob(job, onFinished);

  expect(sequence).toEqual([
    'restored-tabs',
    'closed-temporary-tabs',
    'finished',
    'opened-final-popup',
  ]);
});

it('downloads staged pages and publishes terminal status only after browser completion', async () => {
  const job = createJob();
  job.status.progress = {
    ...job.status.progress,
    activeStepKey: 'files',
    completedStepKeys: ['json', 'markdown'],
    failedStepKeys: ['images'],
  };
  const onFinished = vi.fn();
  await executePopupExportJob(job, onFinished);

  expect(mocks.prepareDownloadRuntime).toHaveBeenCalledOnce();
  expect(mocks.prepareDownloadRuntime.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.collect.mock.invocationCallOrder[0]!
  );
  expect(mocks.download).toHaveBeenCalledWith(
    expect.objectContaining({
      jobId: 'job-1',
      requestedPageCount: 1,
      signal: job.abortController.signal,
    })
  );
  expect(job.status.phase).toBe('completed');
  expect(job.status.result).toMatchObject({ filename: 'page-package.zip', success: true });
  expect(job.status.result?.stats).toEqual(producerDescriptor.producerStats);
  expect(job.status.progress).toMatchObject({
    completedStepKeys: ['json', 'markdown'],
    failedStepKeys: ['images'],
  });
  expect(mocks.release).toHaveBeenCalledWith('job-1');
  expect(onFinished).toHaveBeenCalledOnce();
});

it('retains partial page errors while delivering the successful package', async () => {
  const job = createJob();
  job.status.orderedTabs.push({ tabId: 8, title: 'Missing' });
  mocks.collect.mockResolvedValue({
    errors: ['Missing: capture failed'],
    packages: [{ descriptor: producerDescriptor, tab: {} }],
  });
  await executePopupExportJob(job, vi.fn());

  expect(job.status.phase).toBe('completed');
  expect(job.status.result).toMatchObject({ success: false, errors: ['Missing: capture failed'] });
});

it('publishes Save-intent packages through Library without invoking archive download', async () => {
  const job = createJob();
  job.status.intent = 'save';
  job.status.effectiveComponentPlan = {
    components: {
      attachments: false,
      diagnostics: true,
      images: false,
      pageData: false,
      webCopy: true,
    },
    diagnosticsLevel: 'standard',
    includeScreenshot: true,
  };
  mocks.save
    .mockResolvedValueOnce({ failures: [], snapshotIds: ['snapshot-1'] })
    .mockResolvedValueOnce({
      failures: [{ error: 'quota reached', ordinal: 1, tabId: 8 }],
      snapshotIds: [],
    });
  job.status.orderedTabs.push({ tabId: 8, title: 'Second' });
  job.status.pageOutcomes.push({ ordinal: 1, status: 'succeeded', tabId: 8 });

  await executePopupExportJob(job, vi.fn());

  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      jobId: 'job-1',
      packages: expect.any(Array),
      signal: expect.any(AbortSignal),
    })
  );
  expect(mocks.prepareDownloadRuntime).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.releaseOne).toHaveBeenCalledTimes(2);
  expect(job.status.phase).toBe('completed');
  expect(job.status.pageOutcomes[1]).toMatchObject({ status: 'failed' });
  expect(job.status.result).toMatchObject({
    kind: 'webSnapshot',
    snapshotBatchSize: 2,
    snapshotIds: ['snapshot-1'],
    success: true,
  });
});

it('does not publish saved IDs when cancellation owns the terminal transition', async () => {
  const job = createJob();
  job.status.intent = 'save';
  mocks.complete.mockImplementationOnce(async (active: ActivePopupExportJob) => {
    active.cancelled = true;
    return false;
  });

  await executePopupExportJob(job, vi.fn());

  expect(job.status.phase).toBe('cancelled');
  expect(job.status.progress).toMatchObject({ errors: [], phase: 'cancelled' });
  expect(job.status.result).toBeUndefined();
  expect(mocks.cleanupCancellation).toHaveBeenCalledWith(job);
});

it('stops before the next Save page after the in-flight publication observes cancellation', async () => {
  const job = createJob();
  job.status.intent = 'save';
  job.status.orderedTabs.push({ tabId: 8, title: 'Second' }, { tabId: 9, title: 'Third' });
  job.status.pageOutcomes.push(
    { ordinal: 1, status: 'pending', tabId: 8 },
    { ordinal: 2, status: 'pending', tabId: 9 }
  );
  mocks.save.mockImplementationOnce(async () => {
    job.cancelled = true;
    return { failures: [], snapshotIds: ['snapshot-1'] };
  });

  await executePopupExportJob(job, vi.fn());

  expect(mocks.save).toHaveBeenCalledOnce();
  expect(mocks.releaseOne).toHaveBeenCalledOnce();
  expect(mocks.cleanupCancellation).toHaveBeenCalledWith(job);
  expect(job.status.phase).toBe('cancelled');
});

it('publishes an unavailable selected tab as a failed terminal page outcome', async () => {
  const job = createJob();
  job.status.orderedTabs.push({ tabId: 8, title: 'Missing' });
  job.status.pageOutcomes.push({ ordinal: 1, status: 'pending', tabId: 8 });
  mocks.resolveTabs.mockImplementationOnce(async () => {
    job.status.pageOutcomes[1] = {
      error: 'Missing: tab unavailable',
      ordinal: 1,
      status: 'failed',
      tabId: 8,
    };
    return new Map([[7, { id: 7 }]]);
  });
  mocks.collect.mockResolvedValue({
    errors: ['Missing: tab unavailable'],
    packages: [{ descriptor: producerDescriptor, tab: {} }],
  });

  await executePopupExportJob(job, vi.fn());

  expect(job.status.pageOutcomes).toEqual([
    { ordinal: 0, status: 'pending', tabId: 7 },
    expect.objectContaining({ error: 'Missing: tab unavailable', status: 'failed', tabId: 8 }),
  ]);
  expect(job.status.result).toMatchObject({
    errors: ['Missing: tab unavailable'],
    success: false,
  });
  expect(mocks.download).toHaveBeenCalledWith(
    expect.objectContaining({
      failedPages: [{ message: 'Missing: tab unavailable', ordinal: 2, title: 'Missing' }],
      requestedPageCount: 2,
    })
  );
});

it('marks cancellation terminal and still releases staged authority', async () => {
  const job = createJob();
  job.cancelled = true;
  await executePopupExportJob(job, vi.fn());

  expect(job.status.phase).toBe('cancelled');
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalledWith('job-1');
});

it('keeps cancellation retryable when session or asset cleanup is incomplete', async () => {
  const job = createJob();
  const onFinished = vi.fn();
  job.cancelled = true;
  job.contentPort.cancelPagePackage = vi.fn().mockRejectedValue(new Error('delete unavailable'));

  await executePopupExportJob(job, onFinished);

  expect(job.status.phase).toBe('cancelling');
  expect(job.status.result).toMatchObject({
    errors: expect.arrayContaining([expect.stringContaining('cancellation cleanup is incomplete')]),
    success: false,
  });
  expect(job.cancellationCleanupError).toBeInstanceOf(Error);
  expect(job.finishCancellation).toBe(onFinished);
  expect(onFinished).not.toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalledWith('job-1');
});

it('fails without invoking download when no staged page survived collection', async () => {
  const job = createJob();
  mocks.collect.mockResolvedValue({ errors: ['Page: capture failed'], packages: [] });

  await executePopupExportJob(job, vi.fn());

  expect(job.status.phase).toBe('failed');
  expect(job.status.result).toMatchObject({ success: false, errors: ['Page: capture failed'] });
  expect(mocks.download).not.toHaveBeenCalled();
});

it('publishes only a fixed download lifecycle failure without cleanup internals', async () => {
  const job = createJob();
  mocks.download.mockRejectedValueOnce(
    new Error('Page Package download could not be completed safely.')
  );
  mocks.release.mockRejectedValueOnce(new Error('staged cleanup failed'));

  await executePopupExportJob(job, vi.fn());

  expect(job.status.phase).toBe('failed');
  expect(job.status.result).toMatchObject({
    errors: ['Page Package download could not be completed safely.'],
    success: false,
    warnings: [],
  });
});

it('does not persist hostile archive validation detail in public status', async () => {
  const job = createJob();
  mocks.download.mockRejectedValueOnce(
    new Error('Staged Page Package entry digest does not match: private/account-42.json.')
  );

  await executePopupExportJob(job, vi.fn());

  expect(job.status.phase).toBe('failed');
  expect(job.status.result).toMatchObject({
    errors: ['Page Package could not be validated or downloaded safely.'],
    success: false,
  });
  expect(JSON.stringify(job.status)).not.toContain('private/account-42.json');
});

it('does not publish completed before durable staged cleanup succeeds', async () => {
  const job = createJob();
  mocks.release.mockRejectedValueOnce(new Error('OPFS internal detail'));

  await executePopupExportJob(job, vi.fn());

  expect(job.status.phase).toBe('failed');
  expect(job.status.result).toMatchObject({
    errors: ['Page Package cleanup is incomplete.'],
    success: false,
  });
  expect(job.status.result?.errors.join(' ')).not.toContain('OPFS internal detail');
});
