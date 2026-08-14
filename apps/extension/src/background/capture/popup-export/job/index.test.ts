import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PopupExportJobStatus } from '@sniptale/runtime-contracts/export';
import { translate } from '../../../../platform/i18n';

const mocks = vi.hoisted(() => ({
  activeByWindow: new Map<number, number>(),
  activationListener: null as ((info: { tabId: number; windowId: number }) => void) | null,
  captureFullPage: vi.fn(),
  cancelPackage: vi.fn(),
  clearStatus: vi.fn(),
  createArchive: vi.fn(),
  download: vi.fn(),
  ensureAccess: vi.fn(),
  ensureAuthority: vi.fn(),
  getAllFrames: vi.fn(),
  getTab: vi.fn(),
  loadSettings: vi.fn(),
  queryTabs: vi.fn(),
  readStatus: vi.fn(),
  requestPackage: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  updateTab: vi.fn(),
  updateWindow: vi.fn(),
  writeStatus: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: mocks.getTab,
    query: mocks.queryTabs,
    subscribeToActivated: vi.fn((listener) => {
      mocks.activationListener = listener;
      return () => {
        mocks.activationListener = null;
      };
    }),
    update: mocks.updateTab,
  },
}));
vi.mock('@sniptale/platform/browser/windows', () => ({
  browserWindows: { update: mocks.updateWindow },
}));
vi.mock('@sniptale/platform/browser/web-navigation', () => ({
  browserWebNavigation: { getAllFrames: mocks.getAllFrames },
}));
vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));
vi.mock('../../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../page-access/service')>()),
  ensureActivePageAccessRuntime: mocks.ensureAccess,
  ensureNativeVisibleCaptureAuthority: mocks.ensureAuthority,
}));
vi.mock('../../index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../index')>()),
  captureFullPageForArchive: mocks.captureFullPage,
}));
vi.mock('../../download/download-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../download/download-router')>()),
  executeDownloadBlob: mocks.download,
}));
vi.mock('./archive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./archive')>()),
  createPopupExportJobArchive: mocks.createArchive,
}));
vi.mock('./storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storage')>()),
  clearPopupExportJobStatus: mocks.clearStatus,
  readPopupExportJobStatus: mocks.readStatus,
  writePopupExportJobStatus: mocks.writeStatus,
}));

import {
  acknowledgePopupExportJobStatus,
  cancelPopupExportJob,
  erasePopupExportJobState,
  getPopupExportJobStatus,
  startPopupExportJob,
} from './index';
import { reservePopupExportErasureExclusion } from './lifecycle-gate';

const options = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: true,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
  includePageDiagnostics: false,
};

function packageResponse(title: string) {
  return {
    success: true,
    pagePackage: {
      archiveBaseName: title,
      entries: [{ path: `${title}.json`, textContent: '{}' }],
      errors: [],
      stats: { filesCount: 1, filesFailed: 0, rowsCount: 0, sectionsCount: 1 },
    },
  };
}

async function waitForPhase(phase: PopupExportJobStatus['phase']) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const status = await getPopupExportJobStatus('job-1');
    if (status?.phase === phase) return status;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Popup export job did not reach ${phase}`);
}

function createStoredStatus(
  phase: PopupExportJobStatus['phase'],
  overrides: Partial<PopupExportJobStatus> = {}
): PopupExportJobStatus {
  return {
    activatedTabIds: [],
    effectiveOptions: options,
    jobId: 'job-1',
    orderedTabs: [{ tabId: 11, title: 'One' }],
    originalActiveTabs: [],
    phase,
    progress: {
      activeStepKey: null,
      current: phase === 'completed' ? 1 : 0,
      errors: [],
      message: phase,
      phase: phase === 'completed' ? 'done' : 'scanning',
      total: 1,
    },
    revision: 1,
    warnings: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeByWindow.clear();
  mocks.activationListener = null;
  mocks.readStatus.mockResolvedValue(null);
  mocks.writeStatus.mockImplementation(async (status) => {
    mocks.readStatus.mockResolvedValue(structuredClone(status));
  });
  mocks.clearStatus.mockImplementation(async () => {
    mocks.readStatus.mockResolvedValue(null);
  });
  mocks.sendRuntimeMessage.mockResolvedValue(undefined);
  mocks.ensureAccess.mockResolvedValue(undefined);
  mocks.cancelPackage.mockResolvedValue(undefined);
  mocks.ensureAuthority.mockResolvedValue(undefined);
  mocks.getAllFrames.mockImplementation(async ({ tabId }) => [
    { documentId: `document-${tabId}`, frameId: 0 },
  ]);
  mocks.loadSettings.mockResolvedValue({ defaultExportPresetId: 'preset-1' });
  mocks.createArchive.mockResolvedValue({ blob: new Blob(['zip']), filename: 'pages.zip' });
  mocks.download.mockResolvedValue(undefined);
  mocks.captureFullPage.mockResolvedValue({
    dataUrl: 'data:image/png;base64,cG5n',
    metadata: { warnings: [] },
  });
  mocks.queryTabs.mockImplementation(async ({ windowId }) => {
    const tabId = mocks.activeByWindow.get(windowId);
    return tabId === undefined ? [] : [{ id: tabId, windowId }];
  });
  mocks.updateTab.mockImplementation(async (tabId, update) => {
    const tab = await mocks.getTab(tabId);
    if (update.active && typeof tab.windowId === 'number') {
      mocks.activeByWindow.set(tab.windowId, tabId);
      mocks.activationListener?.({ tabId, windowId: tab.windowId });
    }
    return tab;
  });
});

afterEach(async () => {
  await erasePopupExportJobState();
});

it('captures a single already-active tab through the native backend', async () => {
  mocks.getTab.mockResolvedValue({ id: 11, title: 'One', windowId: 1 });
  mocks.activeByWindow.set(1, 11);
  mocks.requestPackage.mockResolvedValue(packageResponse('one'));

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 11, title: 'One' }],
    warnings: [],
  });

  const status = await waitForPhase('completed');
  expect(mocks.captureFullPage).toHaveBeenCalledWith(
    11,
    expect.objectContaining({ backendKind: 'native', exportRunId: 'job-1' })
  );
  expect(status.activatedTabIds).toEqual([11]);
  expect(mocks.download).toHaveBeenCalledOnce();
});

it('acknowledges only matching terminal stored job metadata', async () => {
  mocks.readStatus.mockResolvedValue(createStoredStatus('completed', { jobId: 'job-done' }));

  await acknowledgePopupExportJobStatus('job-other');
  expect(mocks.clearStatus).not.toHaveBeenCalled();

  await acknowledgePopupExportJobStatus('job-done');
  expect(mocks.clearStatus).toHaveBeenCalledOnce();
});

it('does not acknowledge active or unfinished job metadata', async () => {
  mocks.getTab.mockResolvedValue({ id: 11, title: 'One', windowId: 1 });
  mocks.activeByWindow.set(1, 11);
  mocks.requestPackage.mockResolvedValue(packageResponse('one'));

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 11, title: 'One' }],
    warnings: [],
  });

  await acknowledgePopupExportJobStatus('job-1');
  expect(mocks.clearStatus).not.toHaveBeenCalled();

  await waitForPhase('completed');
  mocks.readStatus.mockResolvedValue(createStoredStatus('running', { jobId: 'job-running' }));

  await acknowledgePopupExportJobStatus('job-running');
  expect(mocks.clearStatus).not.toHaveBeenCalled();
});

it('captures an ordered batch across windows and restores each original tab', async () => {
  const tabs = new Map([
    [11, { id: 11, title: 'One', windowId: 1 }],
    [12, { id: 12, title: 'Two', windowId: 2 }],
    [91, { id: 91, title: 'Original one', windowId: 1 }],
    [92, { id: 92, title: 'Original two', windowId: 2 }],
  ]);
  mocks.getTab.mockImplementation(async (tabId) => tabs.get(tabId));
  mocks.activeByWindow.set(1, 91);
  mocks.activeByWindow.set(2, 92);
  mocks.requestPackage
    .mockResolvedValueOnce(packageResponse('one'))
    .mockResolvedValueOnce(packageResponse('two'));

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options,
    orderedTabs: [
      { tabId: 11, title: 'One' },
      { tabId: 12, title: 'Two' },
    ],
    warnings: [],
  });

  const status = await waitForPhase('completed');
  expect(mocks.requestPackage.mock.calls.map(([request]) => request.tabId)).toEqual([11, 12]);
  expect(mocks.captureFullPage.mock.calls.map(([tabId]) => tabId)).toEqual([11, 12]);
  expect(mocks.updateTab.mock.calls.map(([tabId]) => tabId)).toEqual([11, 12, 91, 92]);
  expect(status.originalActiveTabs).toEqual([
    { windowId: 1, tabId: 91 },
    { windowId: 2, tabId: 92 },
  ]);
  expect(mocks.download).toHaveBeenCalledOnce();
});

it('stops remaining screenshots after a manual tab switch without losing page packages', async () => {
  const tabs = new Map([
    [11, { id: 11, title: 'One', windowId: 1 }],
    [12, { id: 12, title: 'Two', windowId: 1 }],
    [91, { id: 91, title: 'Original', windowId: 1 }],
  ]);
  mocks.getTab.mockImplementation(async (tabId) => tabs.get(tabId));
  mocks.activeByWindow.set(1, 91);
  mocks.requestPackage
    .mockResolvedValueOnce(packageResponse('one'))
    .mockResolvedValueOnce(packageResponse('two'));
  mocks.captureFullPage.mockImplementationOnce(async () => {
    mocks.activeByWindow.set(1, 77);
    mocks.activationListener?.({ tabId: 77, windowId: 1 });
    return { dataUrl: 'data:image/png;base64,cG5n', metadata: { warnings: [] } };
  });

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options,
    orderedTabs: [
      { tabId: 11, title: 'One' },
      { tabId: 12, title: 'Two' },
    ],
    warnings: [],
  });

  const status = await waitForPhase('completed');
  expect(mocks.requestPackage).toHaveBeenCalledTimes(2);
  expect(mocks.captureFullPage).toHaveBeenCalledOnce();
  expect(mocks.updateTab.mock.calls.map(([tabId]) => tabId)).not.toContain(91);
  expect(status.warnings).toContain(translate('popup.export.manualTabConflictWarning'));
});

it('cancels without starting capture and reports partial package failures', async () => {
  let resolvePackage!: (value: ReturnType<typeof packageResponse>) => void;
  mocks.getTab.mockResolvedValue({ id: 11, title: 'One', windowId: 1 });
  mocks.activeByWindow.set(1, 11);
  mocks.requestPackage.mockReturnValue(
    new Promise((resolve) => {
      resolvePackage = resolve;
    })
  );

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 11, title: 'One' }],
    warnings: [],
  });
  await cancelPopupExportJob('job-1');
  resolvePackage(packageResponse('one'));

  await waitForPhase('cancelled');
  expect(mocks.cancelPackage).toHaveBeenCalledWith({ exportRunId: 'job-1', tabId: 11 });
  expect(mocks.captureFullPage).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
});

it('restores the original tab when cancellation lands during native capture', async () => {
  const tabs = new Map([
    [11, { id: 11, title: 'One', windowId: 1 }],
    [91, { id: 91, title: 'Original', windowId: 1 }],
  ]);
  mocks.getTab.mockImplementation(async (tabId) => tabs.get(tabId));
  mocks.activeByWindow.set(1, 91);
  mocks.requestPackage.mockResolvedValue(packageResponse('one'));
  mocks.captureFullPage.mockImplementation(
    async (_tabId, captureOptions: { abortSignal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        captureOptions.abortSignal.addEventListener('abort', () => reject(new Error('cancelled')));
      })
  );

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 11, title: 'One' }],
    warnings: [],
  });
  await vi.waitFor(() => expect(mocks.captureFullPage).toHaveBeenCalledOnce());
  await cancelPopupExportJob('job-1');

  await waitForPhase('cancelled');
  await vi.waitFor(() =>
    expect(mocks.updateTab.mock.calls.map(([tabId]) => tabId)).toEqual([11, 91])
  );
  expect(mocks.cancelPackage).toHaveBeenCalledWith({ exportRunId: 'job-1', tabId: 11 });
  expect(mocks.download).not.toHaveBeenCalled();
});

it('continues to download successful packages when another tab fails', async () => {
  mocks.getTab.mockImplementation(async (tabId) => ({ id: tabId, windowId: 1 }));
  mocks.activeByWindow.set(1, 91);
  mocks.requestPackage
    .mockResolvedValueOnce(packageResponse('one'))
    .mockRejectedValueOnce(new Error('package unavailable'));

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options: { ...options, includeFullPageScreenshot: false },
    orderedTabs: [
      { tabId: 11, title: 'One' },
      { tabId: 12, title: 'Two' },
    ],
    warnings: [],
  });

  const status = await waitForPhase('completed');
  expect(status.result?.success).toBe(false);
  expect(status.result?.errors).toContain('Two: package unavailable');
  expect(mocks.download).toHaveBeenCalledOnce();
  expect(mocks.updateTab).not.toHaveBeenCalled();
});

it('performs zero activation and capture attempts when screenshot permission was denied', async () => {
  const warning =
    'Доступ ко всем страницам не выдан: экспорт продолжен без полноразмерных скриншотов.';
  mocks.getTab.mockResolvedValue({ id: 11, title: 'One', windowId: 1 });
  mocks.activeByWindow.set(1, 11);
  mocks.requestPackage.mockResolvedValue(packageResponse('one'));

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options: { ...options, includeFullPageScreenshot: false },
    orderedTabs: [{ tabId: 11, title: 'One' }],
    warnings: [warning],
  });

  const status = await waitForPhase('completed');
  expect(status.warnings).toEqual([warning]);
  expect(mocks.updateWindow).not.toHaveBeenCalled();
  expect(mocks.updateTab).not.toHaveBeenCalled();
  expect(mocks.captureFullPage).not.toHaveBeenCalled();
});

it('rejects a duplicate start while the first job owns the queue', async () => {
  let resolvePackage!: (value: ReturnType<typeof packageResponse>) => void;
  mocks.getTab.mockResolvedValue({ id: 11, title: 'One', windowId: 1 });
  mocks.activeByWindow.set(1, 11);
  mocks.requestPackage.mockReturnValue(
    new Promise((resolve) => {
      resolvePackage = resolve;
    })
  );

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 11, title: 'One' }],
    warnings: [],
  });

  await expect(
    startPopupExportJob({
      contentPort: {
        cancelPagePackage: mocks.cancelPackage,
        requestPagePackage: mocks.requestPackage,
      },
      jobId: 'job-2',
      options,
      orderedTabs: [{ tabId: 11, title: 'One' }],
      warnings: [],
    })
  ).rejects.toThrow('Another popup export job is already active');
  await cancelPopupExportJob('job-1');
  resolvePackage(packageResponse('one'));
  await waitForPhase('cancelled');
});

it('rejects starts reserved out by privacy erasure and clears metadata after admitted work drains', async () => {
  let resolvePackage!: (value: ReturnType<typeof packageResponse>) => void;
  mocks.getTab.mockResolvedValue({ id: 11, title: 'One', windowId: 1 });
  mocks.activeByWindow.set(1, 11);
  mocks.requestPackage.mockReturnValue(
    new Promise((resolve) => {
      resolvePackage = resolve;
    })
  );
  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options: { ...options, includeFullPageScreenshot: false },
    orderedTabs: [{ tabId: 11, title: 'One' }],
    warnings: [],
  });

  const exclusion = reservePopupExportErasureExclusion();
  try {
    let drained = false;
    const drain = exclusion.waitForActiveMutations().then(() => {
      drained = true;
    });
    await expect(
      startPopupExportJob({
        contentPort: {
          cancelPagePackage: mocks.cancelPackage,
          requestPagePackage: mocks.requestPackage,
        },
        jobId: 'job-during-erasure',
        options,
        orderedTabs: [{ tabId: 11, title: 'One' }],
        warnings: [],
      })
    ).rejects.toThrow('unavailable during privacy erasure');
    expect(drained).toBe(false);

    resolvePackage(packageResponse('one'));
    await drain;
    await erasePopupExportJobState();
    expect(mocks.clearStatus).toHaveBeenCalled();
    await expect(getPopupExportJobStatus()).resolves.toBeNull();
  } finally {
    exclusion.release();
  }
});

it('clears active ownership when initial metadata publication fails and permits retry', async () => {
  mocks.writeStatus.mockRejectedValueOnce(new Error('session storage unavailable'));
  await expect(
    startPopupExportJob({
      contentPort: {
        cancelPagePackage: mocks.cancelPackage,
        requestPagePackage: mocks.requestPackage,
      },
      jobId: 'job-initial-failure',
      options,
      orderedTabs: [{ tabId: 11, title: 'One' }],
      warnings: [],
    })
  ).rejects.toThrow('session storage unavailable');

  mocks.getTab.mockResolvedValue({ id: 11, title: 'One', windowId: 1 });
  mocks.activeByWindow.set(1, 11);
  mocks.requestPackage.mockResolvedValue(packageResponse('one'));
  await expect(
    startPopupExportJob({
      contentPort: {
        cancelPagePackage: mocks.cancelPackage,
        requestPagePackage: mocks.requestPackage,
      },
      jobId: 'job-retry',
      options: { ...options, includeFullPageScreenshot: false },
      orderedTabs: [{ tabId: 11, title: 'One' }],
      warnings: [],
    })
  ).resolves.toEqual(expect.objectContaining({ jobId: 'job-retry' }));
});

it('keeps terminal status reads pure and repeatable', async () => {
  mocks.getTab.mockResolvedValue({ id: 11, title: 'One', windowId: 1 });
  mocks.activeByWindow.set(1, 11);
  mocks.requestPackage.mockResolvedValue(packageResponse('one'));
  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options: { ...options, includeFullPageScreenshot: false },
    orderedTabs: [{ tabId: 11, title: 'One' }],
    warnings: [],
  });
  await waitForPhase('completed');
  mocks.clearStatus.mockClear();

  await expect(getPopupExportJobStatus('job-1')).resolves.toEqual(
    expect.objectContaining({ phase: 'completed' })
  );
  await expect(getPopupExportJobStatus('job-1')).resolves.toEqual(
    expect.objectContaining({ phase: 'completed' })
  );
  expect(mocks.clearStatus).not.toHaveBeenCalled();
});

it('observes a manual activation during original-tab publication and never restores over it', async () => {
  const tabs = new Map([
    [11, { id: 11, title: 'One', windowId: 1 }],
    [91, { id: 91, title: 'Original', windowId: 1 }],
  ]);
  mocks.getTab.mockImplementation(async (tabId) => tabs.get(tabId));
  mocks.activeByWindow.set(1, 91);
  mocks.requestPackage.mockResolvedValue(packageResponse('one'));
  mocks.writeStatus.mockImplementation(async (status: PopupExportJobStatus) => {
    mocks.readStatus.mockResolvedValue(structuredClone(status));
    if (status.originalActiveTabs.length === 1 && status.activatedTabIds.length === 0) {
      mocks.activeByWindow.set(1, 77);
      mocks.activationListener?.({ tabId: 77, windowId: 1 });
    }
  });

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 11, title: 'One' }],
    warnings: [],
  });

  const status = await waitForPhase('completed');
  expect(status.warnings).toContain(translate('popup.export.manualTabConflictWarning'));
  expect(mocks.captureFullPage).not.toHaveBeenCalled();
  expect(mocks.updateTab).not.toHaveBeenCalled();
  expect(mocks.activeByWindow.get(1)).toBe(77);
});

it('keeps a successful download when another target closed and reports restore failure', async () => {
  const tabs = new Map<number, chrome.tabs.Tab>([
    [11, { id: 11, title: 'One', windowId: 1 } as chrome.tabs.Tab],
    [91, { id: 91, title: 'Original', windowId: 1 } as chrome.tabs.Tab],
  ]);
  mocks.getTab.mockImplementation(async (tabId) => {
    if (tabId === 12) throw new Error('No tab with id: 12');
    const tab = tabs.get(tabId);
    if (!tab) throw new Error(`No tab with id: ${tabId}`);
    return tab;
  });
  mocks.activeByWindow.set(1, 91);
  mocks.requestPackage.mockResolvedValue(packageResponse('one'));
  mocks.updateTab.mockImplementation(async (tabId, update) => {
    if (tabId === 91) throw new Error('No tab with id: 91');
    const tab = await mocks.getTab(tabId);
    if (update.active && typeof tab.windowId === 'number') {
      mocks.activeByWindow.set(tab.windowId, tabId);
      mocks.activationListener?.({ tabId, windowId: tab.windowId });
    }
    return tab;
  });

  await startPopupExportJob({
    contentPort: {
      cancelPagePackage: mocks.cancelPackage,
      requestPagePackage: mocks.requestPackage,
    },
    jobId: 'job-1',
    options,
    orderedTabs: [
      { tabId: 11, title: 'One' },
      { tabId: 12, title: 'Closed' },
    ],
    warnings: [],
  });

  await waitForPhase('completed');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const status = mocks.writeStatus.mock.calls.at(-1)?.[0] as PopupExportJobStatus;
  expect(mocks.download).toHaveBeenCalledOnce();
  expect(mocks.updateTab.mock.calls.map(([tabId]) => tabId)).toContain(91);
  expect(status.warnings).toEqual(
    expect.arrayContaining([
      expect.stringContaining(`Closed: ${translate('popup.export.tabUnavailableWarningPrefix')}`),
      expect.stringContaining(translate('popup.export.restoreOriginalTabWarningPrefix')),
    ])
  );
});
