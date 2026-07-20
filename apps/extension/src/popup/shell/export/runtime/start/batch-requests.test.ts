import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectorMocks = vi.hoisted(() => ({
  getPopupExportSelection: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  logPopupExportBatchStale: vi.fn(),
  logPopupExportBatchTabRequest: vi.fn(),
  logPopupExportBatchTabResult: vi.fn(),
  logPopupExportBatchUnexpectedFailure: vi.fn(),
}));

const optionsMocks = vi.hoisted(() => ({
  buildPopupExportOptions: vi.fn(),
}));

const previewMocks = vi.hoisted(() => ({
  getPopupExportTransportErrorMessage: vi.fn(),
}));

const stateMocks = vi.hoisted(() => ({
  isCurrentBatchRequest: vi.fn(),
  setBatchExportProgress: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../session/selectors', () => selectorMocks);
vi.mock('../logging', () => loggingMocks);
vi.mock('../options', () => optionsMocks);
vi.mock('../preview-request', () => previewMocks);
vi.mock('./batch-state', () => stateMocks);

import { collectBatchPagePackages } from './batch-requests';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PopupExportRuntimeContract } from '../state';
import type { PopupExportRuntimeDeps } from '../types';

function createState(): PopupExportRuntimeContract {
  return {
    availableTabs: [],
    canCopyJson: false,
    canCopyMarkdown: false,
    canExport: true,
    copiedFormat: null,
    copyingFormat: null,
    copyRequestIdRef: { current: 0 },
    copyResetTimeoutRef: { current: null },
    exportDisabledReason: null,
    filterQuery: '',
    filteredTabs: [],
    hasLoadedPreferences: true,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: true,
    isExporting: false,
    isFilterActive: false,
    progress: { current: 0, errors: [], message: '', phase: 'idle', total: 0 },
    progressSteps: [],
    requestIdRef: { current: 'req-1' as string | null },
    result: null,
    selectedCount: 0,
    selectedTabIds: [],
    selectedTabIdsInOrder: [],
    setCopiedFormat: vi.fn(),
    setCopyingFormat: vi.fn(),
    setFilterQuery: vi.fn(),
    setIncludeBasicLogs: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludeHarDomLogs: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
    setProgress: vi.fn(),
    setResult: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
  };
}

function createTab(overrides: Partial<PopupExportRuntimeContract['availableTabs'][number]> = {}) {
  return {
    disabledReason: null,
    isCurrent: false,
    tabId: 7,
    title: 'Example Tab',
    url: 'https://example.test/',
    ...overrides,
  };
}

function createDeps() {
  const sendBuildPackageMessage = vi.fn<PopupExportRuntimeDeps['sendBuildPackageMessage']>();
  return {
    clearTimeout: vi.fn(),
    createRequestId: vi.fn(() => 'req-1'),
    getActiveTabId: vi.fn(),
    requestPreview: vi.fn(),
    saveArchiveBlob: vi.fn(),
    scheduleTimeout: vi.fn(),
    sendCancelMessage: vi.fn(),
    sendBuildPackageMessage,
    sendStartMessage: vi.fn(),
    writeClipboardText: vi.fn(),
  };
}

function createPagePackage() {
  return {
    archiveBaseName: 'example_page',
    entries: [{ path: 'example_page.json', textContent: '{}' }],
    errors: ['Row missing alt text'],
    stats: {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectorMocks.getPopupExportSelection.mockReturnValue({ mode: 'selected-pages' });
  optionsMocks.buildPopupExportOptions.mockReturnValue({ includeMarkdown: true });
  previewMocks.getPopupExportTransportErrorMessage.mockReturnValue('transport failed');
  stateMocks.isCurrentBatchRequest.mockReturnValue(true);
});

async function verifySuccessfulBatchCollection() {
  const deps = createDeps();
  deps.sendBuildPackageMessage.mockResolvedValue({
    pagePackage: createPagePackage(),
    success: true,
  });

  await expect(
    collectBatchPagePackages({
      deps,
      requestId: 'req-1',
      selectedTabs: [createTab()],
      state: createState(),
    })
  ).resolves.toEqual({
    errors: ['Example Tab: Row missing alt text'],
    pagePackages: [
      {
        pagePackage: createPagePackage(),
        tabId: 7,
        tabTitle: 'Example Tab',
      },
    ],
  });

  expect(stateMocks.setBatchExportProgress).toHaveBeenCalledWith(
    expect.any(Object),
    0,
    1,
    'popup.export.batchCollectingMessage Example Tab',
    'downloading'
  );
  expect(loggingMocks.logPopupExportBatchTabRequest).toHaveBeenCalledWith({
    index: 1,
    requestId: 'req-1',
    tabId: 7,
    total: 1,
  });
  expect(deps.sendBuildPackageMessage).toHaveBeenCalledWith(7, {
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    options: { includeMarkdown: true },
  });
}

async function verifyStaleAndTablessRequests() {
  stateMocks.isCurrentBatchRequest.mockReturnValue(false);

  await expect(
    collectBatchPagePackages({
      deps: createDeps(),
      requestId: 'req-1',
      selectedTabs: [createTab()],
      state: createState(),
    })
  ).resolves.toBeNull();

  stateMocks.isCurrentBatchRequest.mockReturnValue(true);
  await expect(
    collectBatchPagePackages({
      deps: createDeps(),
      requestId: 'req-1',
      selectedTabs: [createTab({ tabId: null })],
      state: createState(),
    })
  ).resolves.toBeNull();
}

async function verifyErrorCollection() {
  const deps = createDeps();
  deps.sendBuildPackageMessage
    .mockResolvedValueOnce({
      error: 'remote failed',
      success: false,
    })
    .mockRejectedValueOnce(new Error('network down'));

  await expect(
    collectBatchPagePackages({
      deps,
      requestId: 'req-1',
      selectedTabs: [createTab(), createTab({ tabId: 8, title: 'Second Tab' })],
      state: createState(),
    })
  ).resolves.toEqual({
    errors: ['Example Tab: transport failed', 'Second Tab: transport failed'],
    pagePackages: [],
  });

  expect(loggingMocks.logPopupExportBatchTabResult).toHaveBeenCalledWith({
    error: 'remote failed',
    hasPagePackage: false,
    index: 1,
    requestId: 'req-1',
    success: false,
    tabId: 7,
    total: 2,
  });
  expect(loggingMocks.logPopupExportBatchUnexpectedFailure).toHaveBeenCalledWith({
    error: expect.any(Error),
    index: 2,
    requestId: 'req-1',
    tabId: 8,
    total: 2,
  });
}

async function verifyUnsafePackageResponseRejected() {
  const deps = createDeps();
  deps.sendBuildPackageMessage.mockResolvedValue({
    pagePackage: {
      ...createPagePackage(),
      entries: [{ path: '../evil.txt', textContent: 'evil' }],
    },
    success: true,
  });

  await expect(
    collectBatchPagePackages({
      deps,
      requestId: 'req-1',
      selectedTabs: [createTab()],
      state: createState(),
    })
  ).resolves.toEqual({
    errors: ['Example Tab: transport failed'],
    pagePackages: [],
  });
  expect(loggingMocks.logPopupExportBatchUnexpectedFailure).toHaveBeenCalledWith({
    error: expect.any(Error),
    index: 1,
    requestId: 'req-1',
    tabId: 7,
    total: 1,
  });
}

describe('collectBatchPagePackages', () => {
  it(
    'collects successful page packages and prefixes per-page export errors',
    verifySuccessfulBatchCollection
  );
  it(
    'returns null for stale or tabless requests before any message send',
    verifyStaleAndTablessRequests
  );
  it(
    'records unsuccessful responses and thrown failures as tab-prefixed transport errors',
    verifyErrorCollection
  );
  it(
    'rejects unsafe successful package responses before collection',
    verifyUnsafePackageResponseRejected
  );
});
