import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  collect: vi.fn(),
  createArchive: vi.fn(),
  createResult: vi.fn(),
  download: vi.fn(),
  loadSettings: vi.fn(),
  resolveTabs: vi.fn(),
  restore: vi.fn(),
  subscribe: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../../download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../download/download-router')>()),
  executeDownloadBlob: mocks.download,
}));
vi.mock('./archive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./archive')>()),
  createPopupExportJobArchive: mocks.createArchive,
  createPopupExportJobResult: mocks.createResult,
}));
vi.mock('./visible', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./visible')>()),
  capturePopupExportScreenshots: mocks.capture,
  resolvePopupExportTabsAndOriginals: mocks.resolveTabs,
  restorePopupExportOriginalTabs: mocks.restore,
  subscribeToPopupExportManualActivation: mocks.subscribe,
}));
vi.mock('./package-phase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./package-phase')>()),
  collectPopupExportPagePackages: mocks.collect,
}));
vi.mock('./runtime-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-state')>()),
  updatePopupExportJobStatus: mocks.update,
}));

import { executePopupExportJob } from './execute';
import type { ActivePopupExportJob } from './runtime-state';

function createJob(): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: false,
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
      orderedTabs: [{ tabId: 1, title: 'One' }],
      originalActiveTabs: [],
      phase: 'running',
      progress: { current: 0, errors: [], message: '', phase: 'scanning', total: 1 },
      revision: 1,
      warnings: [],
    },
    unsubscribeActivation: vi.fn(),
  };
}

const collectedPackage = {
  pagePackage: {
    archiveBaseName: 'one',
    entries: [{ path: 'one.json', textContent: '{}' }],
    errors: [],
    stats: { filesCount: 1, filesFailed: 0, rowsCount: 1, sectionsCount: 1 },
  },
  tab: { tabId: 1, title: 'One' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveTabs.mockResolvedValue(new Map([[1, { id: 1 }]]));
  mocks.collect.mockResolvedValue({ errors: [], packages: [collectedPackage] });
  mocks.capture.mockResolvedValue(undefined);
  mocks.createArchive.mockResolvedValue({ blob: new Blob(['zip']), filename: 'pages.zip' });
  mocks.createResult.mockImplementation((args) => ({ ...args, stats: {}, success: true }));
  mocks.loadSettings.mockResolvedValue({ defaultExportPresetId: 'preset-1' });
  mocks.download.mockResolvedValue(undefined);
  mocks.restore.mockResolvedValue(undefined);
  mocks.update.mockImplementation(async (job, patch) => {
    job.status = { ...job.status, ...patch };
  });
});

it('collects, captures, downloads, and publishes a completed job', async () => {
  const job = createJob();
  const onFinished = vi.fn();
  await executePopupExportJob(job, onFinished);

  expect(mocks.capture).toHaveBeenCalled();
  expect(mocks.subscribe.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.resolveTabs.mock.invocationCallOrder[0]!
  );
  expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'pages.zip', 'preset-1');
  expect(job.status.phase).toBe('completed');
  expect(job.unsubscribeActivation).toHaveBeenCalled();
  expect(onFinished).toHaveBeenCalledOnce();
});

it('publishes failed and cancelled terminal states and restoration warnings', async () => {
  const failedJob = createJob();
  mocks.collect.mockResolvedValueOnce({ errors: ['no package'], packages: [] });
  mocks.restore.mockImplementationOnce(async (job) => {
    job.status.warnings.push('restore failed');
  });
  await executePopupExportJob(failedJob, vi.fn());
  expect(failedJob.status.phase).toBe('failed');
  expect(failedJob.status.warnings).toContain('restore failed');

  const cancelledJob = createJob();
  cancelledJob.cancelled = true;
  mocks.collect.mockResolvedValueOnce({ errors: [], packages: [] });
  await executePopupExportJob(cancelledJob, vi.fn());
  expect(cancelledJob.status.phase).toBe('cancelled');
});

it('preserves the failing finalization stage in terminal errors', async () => {
  const job = createJob();
  mocks.download.mockRejectedValueOnce(new Error('window is not defined'));

  await executePopupExportJob(job, vi.fn());

  expect(job.status.phase).toBe('failed');
  expect(job.status.result?.errors).toEqual([
    'download popup export archive: window is not defined',
  ]);
  expect(job.status.progress.errors).toEqual([
    'download popup export archive: window is not defined',
  ]);
});
