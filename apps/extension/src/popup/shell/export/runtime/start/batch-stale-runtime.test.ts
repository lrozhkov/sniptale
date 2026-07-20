import { expect, it, vi } from 'vitest';

import type { PopupExportRuntimeContract } from '../state';
import type { PopupExportRuntimeDeps } from '../types';
import { startPopupExportBatch } from './batch';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../logging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../logging')>()),
  logPopupExportBatchEmptyResult: vi.fn(),
  logPopupExportBatchStale: vi.fn(),
  logPopupExportBatchStart: vi.fn(),
  logPopupExportBatchTabRequest: vi.fn(),
  logPopupExportBatchTabResult: vi.fn(),
  logPopupExportBatchUnexpectedFailure: vi.fn(),
}));

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

function createState(): PopupExportRuntimeContract {
  return {
    ...createStateSetters(),
    availableTabs: [
      {
        disabledReason: null,
        isCurrent: true,
        tabId: 12,
        title: 'Current tab',
        url: 'https://example.test/current',
      },
    ],
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
    requestIdRef: { current: null },
    result: null,
    selectedCount: 1,
    selectedTabIds: [12],
    selectedTabIdsInOrder: [12],
  };
}

function createDeps(): PopupExportRuntimeDeps {
  return {
    clearTimeout: vi.fn(),
    createRequestId: vi.fn(() => 'batch-1'),
    getActiveTabId: vi.fn(async () => 7),
    requestPreview: vi.fn(),
    saveArchiveBlob: vi.fn(),
    scheduleTimeout: vi.fn(() => 1),
    sendBuildPackageMessage: vi.fn().mockResolvedValueOnce({
      success: false,
      error: 'Could not establish connection. Receiving end does not exist.',
    }),
    sendCancelMessage: vi.fn(),
    sendSaveWebSnapshotMessage: vi.fn(),
    sendStartMessage: vi.fn(),
    writeClipboardText: vi.fn(),
  };
}

it('normalizes stale page runtime errors while collecting a batch export', async () => {
  const state = createState();

  await startPopupExportBatch(state, createDeps(), [12]);

  expect(state.setResult).toHaveBeenNthCalledWith(2, {
    success: false,
    errors: ['Current tab: popup.common.stalePageRuntimeHint'],
    stats: {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    },
  });
});
