import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PopupExportRuntimeContract } from '../state';
import type { PopupExportRuntimeDeps } from '../types';
import { startPopupExportBatch } from './batch';

const loggingMocks = vi.hoisted(() => ({
  logPopupExportBatchArchiveSaveFailure: vi.fn(),
  logPopupExportBatchArchiveSaveStart: vi.fn(),
  logPopupExportBatchArchiveSaveSuccess: vi.fn(),
  logPopupExportBatchEmptyResult: vi.fn(),
  logPopupExportBatchStale: vi.fn(),
  logPopupExportBatchStart: vi.fn(),
  logPopupExportBatchTabRequest: vi.fn(),
  logPopupExportBatchTabResult: vi.fn(),
  logPopupExportBatchUnexpectedFailure: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../logging', () => loggingMocks);

beforeEach(() => {
  vi.clearAllMocks();
});

function createPagePackage(archiveBaseName: string) {
  return {
    archiveBaseName,
    entries: [{ path: `${archiveBaseName}.json`, textContent: '{}' }],
    errors: [],
    stats: {
      sectionsCount: 1,
      rowsCount: 2,
      filesCount: 0,
      filesFailed: 0,
    },
  };
}

function createAvailableTabs(): PopupExportRuntimeContract['availableTabs'] {
  return [
    {
      disabledReason: null,
      isCurrent: true,
      tabId: 12,
      title: 'Current tab',
      url: 'https://example.test/current',
    },
    {
      disabledReason: null,
      isCurrent: false,
      tabId: 14,
      title: 'Second tab',
      url: 'https://example.test/second',
    },
  ];
}

function createStateSetters() {
  return {
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

function createState(
  overrides: Partial<PopupExportRuntimeContract> = {}
): PopupExportRuntimeContract {
  return {
    ...createStateSetters(),
    availableTabs: createAvailableTabs(),
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
    includeMarkdown: false,
    isExporting: false,
    isFilterActive: false,
    progress: { current: 0, errors: [], message: '', phase: 'idle', total: 0 },
    progressSteps: [],
    requestIdRef: { current: null as string | null },
    result: null,
    selectedCount: 2,
    selectedTabIds: [12, 14],
    selectedTabIdsInOrder: [12, 14],
    ...overrides,
  };
}

function createDeps(overrides: Partial<PopupExportRuntimeDeps> = {}): PopupExportRuntimeDeps {
  return {
    clearTimeout: vi.fn(),
    createRequestId: vi.fn(() => 'batch-1'),
    getActiveTabId: vi.fn(async () => 7),
    requestPreview: vi.fn(),
    saveArchiveBlob: vi.fn().mockResolvedValue(undefined),
    scheduleTimeout: vi.fn(() => 1),
    sendBuildPackageMessage: vi.fn(),
    sendCancelMessage: vi.fn(),
    sendSaveWebSnapshotMessage: vi.fn(),
    sendStartMessage: vi.fn(),
    writeClipboardText: vi.fn(),
    ...overrides,
  };
}

async function verifyBatchFailureResult(state: ReturnType<typeof createState>) {
  expect(state.setResult).toHaveBeenNthCalledWith(1, null);
  expect(state.setResult).toHaveBeenNthCalledWith(2, {
    success: false,
    errors: ['Current tab: failed on current', 'Second tab: failed on second'],
    stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
  });
  expect(state.setProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: 'error',
      total: 2,
    })
  );
}

function verifyBatchFailureLogging() {
  expect(loggingMocks.logPopupExportBatchStart).toHaveBeenCalledWith({
    requestId: 'batch-1',
    selectedCount: 2,
  });
  expect(loggingMocks.logPopupExportBatchTabRequest).toHaveBeenCalledTimes(2);
  expect(loggingMocks.logPopupExportBatchTabResult).toHaveBeenCalledWith({
    error: 'failed on current',
    hasPagePackage: false,
    index: 1,
    requestId: 'batch-1',
    success: false,
    tabId: 12,
    total: 2,
  });
  expect(loggingMocks.logPopupExportBatchUnexpectedFailure).toHaveBeenCalledWith({
    error: expect.any(Error),
    index: 2,
    requestId: 'batch-1',
    tabId: 14,
    total: 2,
  });
  expect(loggingMocks.logPopupExportBatchEmptyResult).toHaveBeenCalledWith({
    errorCount: 2,
    requestId: 'batch-1',
    selectedCount: 2,
  });
}

function verifyArchiveSaveFailureLogging() {
  expect(loggingMocks.logPopupExportBatchArchiveSaveStart).toHaveBeenCalledWith({
    pageCount: 2,
    requestId: 'batch-1',
  });
  expect(loggingMocks.logPopupExportBatchArchiveSaveFailure).toHaveBeenCalledWith({
    error: 'save failed',
    pageCount: 2,
    requestId: 'batch-1',
  });
}

function verifyArchiveSaveFailureResult(state: ReturnType<typeof createState>) {
  expect(state.setResult).toHaveBeenNthCalledWith(1, null);
  expect(state.setResult).toHaveBeenNthCalledWith(2, {
    success: false,
    errors: ['save failed'],
    stats: { filesCount: 0, filesFailed: 0, rowsCount: 4, sectionsCount: 2 },
  });
  expect(state.setProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: 'error',
      message: 'save failed',
      errors: ['save failed'],
    })
  );
}

it('reports an error result when every selected tab fails to build a package', async () => {
  const state = createState();
  const deps = createDeps({
    sendBuildPackageMessage: vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'failed on current' })
      .mockRejectedValueOnce(new Error('failed on second')),
  });

  await startPopupExportBatch(state, deps, [12, 14]);

  expect(deps.sendBuildPackageMessage).toHaveBeenNthCalledWith(
    1,
    12,
    expect.objectContaining({
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  );
  expect(deps.sendBuildPackageMessage).toHaveBeenNthCalledWith(
    2,
    14,
    expect.objectContaining({
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  );
  expect(deps.saveArchiveBlob).not.toHaveBeenCalled();
  expect(state.requestIdRef.current).toBeNull();
  verifyBatchFailureLogging();
  await verifyBatchFailureResult(state);
});

it('surfaces archive save failures after collecting page packages', async () => {
  const state = createState();
  const deps = createDeps({
    saveArchiveBlob: vi.fn().mockRejectedValue(new Error('save failed')),
    sendBuildPackageMessage: vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        pagePackage: createPagePackage('Current_tab_2026-04-09_10-00-00'),
      })
      .mockResolvedValueOnce({
        success: true,
        pagePackage: createPagePackage('Second_tab_2026-04-09_10-01-00'),
      }),
  });

  await startPopupExportBatch(state, deps, [12, 14]);

  expect(deps.saveArchiveBlob).toHaveBeenCalledWith(
    expect.any(Blob),
    expect.stringMatching(/^pages_export_.*\.zip$/)
  );
  expect(state.requestIdRef.current).toBeNull();
  verifyArchiveSaveFailureLogging();
  verifyArchiveSaveFailureResult(state);
});

it('returns early when a newer batch request makes the in-flight response stale', async () => {
  const state = createState();
  const deps = createDeps({
    sendBuildPackageMessage: vi.fn().mockImplementationOnce(async () => {
      state.requestIdRef.current = 'batch-2';

      return {
        success: true,
        pagePackage: createPagePackage('Current_tab_2026-04-09_10-00-00'),
      };
    }),
  });

  await startPopupExportBatch(state, deps, [12]);

  expect(deps.saveArchiveBlob).not.toHaveBeenCalled();
  expect(state.requestIdRef.current).toBe('batch-2');
  expect(loggingMocks.logPopupExportBatchStale).toHaveBeenCalledWith({
    phase: 'request',
    requestId: 'batch-1',
  });
  expect(loggingMocks.logPopupExportBatchStale).toHaveBeenCalledWith({
    phase: 'collect',
    requestId: 'batch-1',
  });
  expect(state.setResult).toHaveBeenCalledTimes(1);
  expect(state.setResult).toHaveBeenCalledWith(null);
});
