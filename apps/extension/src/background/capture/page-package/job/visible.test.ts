import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendWarning: vi.fn(),
  get: vi.fn(),
  listener: null as ((info: { tabId: number; windowId: number }) => void) | null,
  openPopup: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  updateWindow: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: { openPopup: mocks.openPopup },
}));
vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: {
    get: mocks.get,
    query: mocks.query,
    subscribeToActivated: vi.fn((listener) => {
      mocks.listener = listener;
      return vi.fn();
    }),
    update: mocks.update,
  },
}));
vi.mock('@sniptale/platform/browser/windows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/windows')>()),
  browserWindows: { update: mocks.updateWindow },
}));
vi.mock('./runtime-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-state')>()),
  appendPopupExportJobWarning: mocks.appendWarning,
  updatePagePackageJobStatus: mocks.updateStatus,
}));

import {
  activatePopupExportCaptureTarget,
  resolvePopupExportTabsAndOriginals,
  restorePopupExportOriginalTabs,
  subscribeToPopupExportManualActivation,
} from './visible';
import type { ActivePopupExportJob } from './runtime-state';

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
      orderedTabs: [
        { tabId: 7, title: 'One' },
        { tabId: 8, title: 'Missing' },
      ],
      pageOutcomes: [
        { ordinal: 0, status: 'pending', tabId: 7 },
        { ordinal: 1, status: 'pending', tabId: 8 },
      ],
      originalActiveTabs: [],
      phase: 'running',
      progress: { current: 0, errors: [], message: '', phase: 'scanning', total: 2 },
      revision: 1,
      warnings: [],
    },
    unsubscribeActivation: null,
  };
}

function tabFixture(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
  return {
    active: false,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: false,
    incognito: false,
    index: 0,
    pinned: false,
    selected: false,
    windowId: 3,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listener = null;
  mocks.appendWarning.mockResolvedValue(undefined);
  mocks.openPopup.mockResolvedValue(undefined);
  mocks.updateStatus.mockImplementation(async (job: ActivePopupExportJob, patch) => {
    job.status = { ...job.status, ...patch };
  });
});

it('resolves available tabs, records original active tabs, and reports unavailable selections', async () => {
  const job = createJob();
  mocks.get.mockResolvedValueOnce({ id: 7, windowId: 3 }).mockRejectedValueOnce(new Error('gone'));
  mocks.query.mockResolvedValue([{ id: 70, windowId: 3 }]);

  const tabs = await resolvePopupExportTabsAndOriginals(job);

  expect([...tabs.keys()]).toEqual([7]);
  expect(job.affectedWindowIds).toEqual(new Set([3]));
  expect(job.status.originalActiveTabs).toEqual([{ tabId: 70, windowId: 3 }]);
  expect(mocks.appendWarning).toHaveBeenCalledWith(job, expect.stringContaining('Missing'));
  expect(job.status.pageOutcomes).toEqual([
    { ordinal: 0, status: 'pending', tabId: 7 },
    expect.objectContaining({
      error: expect.stringContaining('Missing'),
      status: 'failed',
      tabId: 8,
    }),
  ]);
});

it('distinguishes expected activation from a manual user switch', async () => {
  const job = createJob();
  job.affectedWindowIds.add(3);
  job.expectedActivation = { tabId: 7, windowId: 3 };
  subscribeToPopupExportManualActivation(job);

  mocks.listener?.({ tabId: 7, windowId: 3 });
  expect(job.expectedActivation).toBeNull();
  expect(job.manualActivationConflict).toBe(false);

  mocks.listener?.({ tabId: 99, windowId: 3 });
  await vi.waitFor(() => expect(mocks.appendWarning).toHaveBeenCalledOnce());
  expect(job.manualActivationConflict).toBe(true);
});

it('activates and records the selected screenshot target through the browser seams', async () => {
  const job = createJob();
  mocks.query
    .mockResolvedValueOnce([{ id: 70, windowId: 3 }])
    .mockResolvedValueOnce([{ id: 7, windowId: 3 }]);
  mocks.updateWindow.mockResolvedValue({ id: 3 });
  mocks.update.mockResolvedValue({ id: 7, windowId: 3 });

  await activatePopupExportCaptureTarget(job, tabFixture({ id: 7 }), job.status.orderedTabs[0]!);

  expect(mocks.updateWindow).toHaveBeenCalledWith(3, { focused: true });
  expect(mocks.update).toHaveBeenCalledWith(7, { active: true });
  expect(mocks.openPopup).toHaveBeenCalledWith({ windowId: 3 });
  expect(job.lastActivatedByWindow).toEqual(new Map([[3, 7]]));
  expect(job.status.activatedTabIds).toEqual([7]);
});

it('does not refocus or reactivate an already active capture target', async () => {
  const job = createJob();
  mocks.query.mockResolvedValue([{ id: 7, windowId: 3 }]);

  await activatePopupExportCaptureTarget(job, tabFixture({ id: 7 }), job.status.orderedTabs[0]!);

  expect(mocks.updateWindow).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.openPopup).not.toHaveBeenCalled();
  expect(job.lastActivatedByWindow).toEqual(new Map());
  expect(job.status.activatedTabIds).toEqual([]);
});

it('restores progress popup after every automatic target switch in a multi-page job', async () => {
  const job = createJob();
  mocks.query
    .mockResolvedValueOnce([{ id: 70, windowId: 3 }])
    .mockResolvedValueOnce([{ id: 7, windowId: 3 }])
    .mockResolvedValueOnce([{ id: 7, windowId: 3 }])
    .mockResolvedValueOnce([{ id: 8, windowId: 3 }]);
  mocks.updateWindow.mockResolvedValue({ id: 3 });
  mocks.update.mockImplementation(async (tabId) => ({ id: tabId, windowId: 3 }));

  await activatePopupExportCaptureTarget(job, tabFixture({ id: 7 }), job.status.orderedTabs[0]!);
  await activatePopupExportCaptureTarget(job, tabFixture({ id: 8 }), job.status.orderedTabs[1]!);

  expect(mocks.openPopup).toHaveBeenNthCalledWith(1, { windowId: 3 });
  expect(mocks.openPopup).toHaveBeenNthCalledWith(2, { windowId: 3 });
  expect(job.status.activatedTabIds).toEqual([7, 8]);
});

it('keeps popup restoration presentation-only for single-page jobs and open failures', async () => {
  const singlePageJob = createJob();
  singlePageJob.status.orderedTabs = [singlePageJob.status.orderedTabs[0]!];
  mocks.query
    .mockResolvedValueOnce([{ id: 70, windowId: 3 }])
    .mockResolvedValueOnce([{ id: 7, windowId: 3 }]);
  mocks.updateWindow.mockResolvedValue({ id: 3 });
  mocks.update.mockResolvedValue({ id: 7, windowId: 3 });

  await activatePopupExportCaptureTarget(
    singlePageJob,
    tabFixture({ id: 7 }),
    singlePageJob.status.orderedTabs[0]!
  );

  expect(mocks.openPopup).not.toHaveBeenCalled();

  const multiPageJob = createJob();
  mocks.openPopup.mockRejectedValueOnce(new Error('Popup unavailable'));
  mocks.query
    .mockResolvedValueOnce([{ id: 70, windowId: 3 }])
    .mockResolvedValueOnce([{ id: 7, windowId: 3 }]);

  await expect(
    activatePopupExportCaptureTarget(
      multiPageJob,
      tabFixture({ id: 7 }),
      multiPageJob.status.orderedTabs[0]!
    )
  ).resolves.toBeUndefined();
  expect(multiPageJob.status.activatedTabIds).toEqual([7]);
});

it('restores progress popup when status publication fails after a verified switch', async () => {
  const job = createJob();
  mocks.query
    .mockResolvedValueOnce([{ id: 70, windowId: 3 }])
    .mockResolvedValueOnce([{ id: 7, windowId: 3 }]);
  mocks.updateWindow.mockResolvedValue({ id: 3 });
  mocks.update.mockResolvedValue({ id: 7, windowId: 3 });
  mocks.updateStatus.mockRejectedValueOnce(new Error('Status unavailable'));

  await expect(
    activatePopupExportCaptureTarget(job, tabFixture({ id: 7 }), job.status.orderedTabs[0]!)
  ).rejects.toThrow('Status unavailable');

  expect(mocks.openPopup).toHaveBeenCalledWith({ windowId: 3 });
  expect(job.lastActivatedByWindow).toEqual(new Map([[3, 7]]));
});

it('rejects unavailable, interrupted, and displaced screenshot targets', async () => {
  const selected = createJob().status.orderedTabs[0]!;
  const unavailableTab = tabFixture({ id: 7 });
  Object.defineProperty(unavailableTab, 'windowId', { value: undefined });
  await expect(
    activatePopupExportCaptureTarget(createJob(), unavailableTab, selected)
  ).rejects.toThrow('Target window is unavailable');

  const interruptedJob = createJob();
  interruptedJob.cancelled = true;
  await expect(
    activatePopupExportCaptureTarget(interruptedJob, tabFixture({ id: 7 }), selected)
  ).rejects.toThrow('Screenshot capture stopped');

  const displacedJob = createJob();
  mocks.query.mockResolvedValue([{ id: 99, windowId: 3 }]);
  await expect(
    activatePopupExportCaptureTarget(displacedJob, tabFixture({ id: 7 }), selected)
  ).rejects.toThrow('Target tab did not remain active');
});

it('restores only a still-job-activated window and reports restoration failure', async () => {
  const job = createJob();
  job.status.originalActiveTabs = [
    { tabId: 70, windowId: 3 },
    { tabId: 80, windowId: 4 },
  ];
  job.lastActivatedByWindow.set(3, 7);
  job.lastActivatedByWindow.set(4, 8);
  mocks.query.mockImplementation(async ({ windowId }) => [
    { id: windowId === 3 ? 7 : 99, windowId },
  ]);
  mocks.update.mockRejectedValueOnce(new Error('cannot restore'));

  await restorePopupExportOriginalTabs(job);

  expect(mocks.update).toHaveBeenCalledWith(70, { active: true });
  expect(mocks.update).not.toHaveBeenCalledWith(80, expect.anything());
  expect(mocks.appendWarning).toHaveBeenCalledWith(job, expect.stringContaining('cannot restore'));
});
