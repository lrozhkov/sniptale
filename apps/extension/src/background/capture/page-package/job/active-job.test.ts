import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./runtime-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-state')>()),
  updatePagePackageJobStatus: vi.fn(async () => undefined),
}));

import type { ActivePopupExportJob } from './runtime-state';
import { updatePagePackageJobStatus } from './runtime-state';
import {
  claimActivePagePackageJob,
  releaseActivePagePackageJob,
  updateActivePagePackageJobProducerProgress,
} from './active-job';

function createJob(): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: false,
    cancellationCleanupComplete: false,
    cancellationCleanupError: null,
    cancellationQueue: Promise.resolve(),
    completion: null,
    contentPort: { cancelPagePackage: vi.fn(), requestPagePackage: vi.fn() },
    expectedActivation: null,
    finishCancellation: null,
    lastActivatedByWindow: new Map(),
    locale: 'en',
    manualActivationConflict: false,
    publicationQueue: Promise.resolve(),
    status: {
      activatedTabIds: [],
      effectiveComponentPlan: {
        components: {
          attachments: true,
          diagnostics: false,
          images: false,
          pageData: true,
          webCopy: true,
        },
        diagnosticsLevel: 'none',
        includeScreenshot: true,
      },
      effectiveOptions: {
        includeBasicLogs: false,
        includeCssDiagnostics: false,
        includeFiles: true,
        includeFullPageScreenshot: true,
        includeImages: false,
        includeJson: true,
        includeMarkdown: false,
        includePageDiagnostics: false,
      },
      intent: 'export',
      jobId: 'job-1',
      orderedTabs: [{ tabId: 7, title: 'Page' }],
      originalActiveTabs: [],
      pageOutcomes: [{ ordinal: 0, status: 'pending', tabId: 7 }],
      phase: 'running',
      progress: {
        current: 0,
        errors: [],
        message: 'Collecting',
        phase: 'downloading',
        total: 1,
      },
      revision: 1,
      warnings: [],
    },
    unsubscribeActivation: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('persists content producer progress on the authoritative active job', async () => {
  const job = createJob();
  expect(claimActivePagePackageJob(job)).toBe(true);
  try {
    await updateActivePagePackageJobProducerProgress({
      activeStepKey: 'files',
      current: 0,
      requestId: 'job-1',
      tabId: 7,
      total: 1,
    });

    expect(updatePagePackageJobStatus).toHaveBeenCalledWith(job, {
      progress: {
        ...job.status.progress,
        activeStepKey: 'files',
        completedStepKeys: [],
        current: 0,
        total: 1,
      },
    });
    await updateActivePagePackageJobProducerProgress({
      activeStepKey: 'files',
      current: 0,
      requestId: 'job-1',
      tabId: 7,
      total: 1,
    });
    expect(updatePagePackageJobStatus).toHaveBeenCalledOnce();
  } finally {
    releaseActivePagePackageJob(job);
  }
});

it('rejects progress that is not bound to the active job and tab', async () => {
  const job = createJob();
  expect(claimActivePagePackageJob(job)).toBe(true);
  try {
    await expect(
      updateActivePagePackageJobProducerProgress({
        activeStepKey: 'files',
        current: 0,
        requestId: 'another-job',
        tabId: 7,
        total: 1,
      })
    ).rejects.toThrow('not bound');
    expect(updatePagePackageJobStatus).not.toHaveBeenCalled();
  } finally {
    releaseActivePagePackageJob(job);
  }
});

it('persists same-step completion and retains completed steps after producer handoff', async () => {
  const job = createJob();
  expect(claimActivePagePackageJob(job)).toBe(true);
  try {
    await updateActivePagePackageJobProducerProgress({
      activeStepKey: 'fullPageScreenshot',
      current: 0,
      requestId: 'job-1',
      tabId: 7,
      total: 1,
    });
    await updateActivePagePackageJobProducerProgress({
      activeStepKey: 'fullPageScreenshot',
      current: 1,
      requestId: 'job-1',
      tabId: 7,
      total: 1,
    });
    await updateActivePagePackageJobProducerProgress({
      activeStepKey: 'json',
      current: 0,
      requestId: 'job-1',
      tabId: 7,
      total: 1,
    });

    expect(updatePagePackageJobStatus).toHaveBeenLastCalledWith(job, {
      progress: expect.objectContaining({
        activeStepKey: 'json',
        completedStepKeys: ['fullPageScreenshot'],
      }),
    });
  } finally {
    releaseActivePagePackageJob(job);
  }
});

it('marks a repeated producer step complete only after every selected tab passes it', async () => {
  const job = createJob();
  job.status.orderedTabs.push({ tabId: 8, title: 'Second page' });
  job.status.pageOutcomes.push({ ordinal: 1, status: 'pending', tabId: 8 });
  expect(claimActivePagePackageJob(job)).toBe(true);
  try {
    for (const update of [
      { activeStepKey: 'webSnapshotPreview' as const, tabId: 7 },
      { activeStepKey: 'webSnapshotDom' as const, tabId: 7 },
      { activeStepKey: 'webSnapshotPreview' as const, tabId: 8 },
    ]) {
      await updateActivePagePackageJobProducerProgress({
        ...update,
        current: 0,
        requestId: 'job-1',
        total: 4,
      });
    }
    expect(updatePagePackageJobStatus).toHaveBeenLastCalledWith(job, {
      progress: expect.objectContaining({ completedStepKeys: [] }),
    });

    await updateActivePagePackageJobProducerProgress({
      activeStepKey: 'webSnapshotDom',
      current: 1,
      requestId: 'job-1',
      tabId: 8,
      total: 4,
    });

    expect(updatePagePackageJobStatus).toHaveBeenLastCalledWith(job, {
      progress: expect.objectContaining({ completedStepKeys: ['webSnapshotPreview'] }),
    });
  } finally {
    releaseActivePagePackageJob(job);
  }
});
