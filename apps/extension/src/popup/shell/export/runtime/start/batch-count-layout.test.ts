import { expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import type { PopupExportRuntimeContract } from '../state';
import type { PopupExportRuntimeDeps } from '../types';
import { startPopupExportBatch } from './batch';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../logging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../logging')>()),
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

function createState(): PopupExportRuntimeContract {
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
  };
}

function createDeps(saveArchiveBlob: (blob: Blob) => Promise<void>): PopupExportRuntimeDeps {
  return {
    clearTimeout: vi.fn(),
    createRequestId: vi.fn(() => 'batch-1'),
    getActiveTabId: vi.fn(async () => 7),
    requestPreview: vi.fn(),
    saveArchiveBlob: vi.fn(saveArchiveBlob),
    scheduleTimeout: vi.fn(() => 1),
    sendBuildPackageMessage: vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        pagePackage: createPagePackage('Current_tab_2026-04-09_10-00-00'),
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'failed on second',
      }),
    sendCancelMessage: vi.fn(),
    sendSaveWebSnapshotMessage: vi.fn(),
    sendStartMessage: vi.fn(),
    writeClipboardText: vi.fn(),
  };
}

async function openSavedArchive(blob: Blob | null) {
  if (!blob) {
    throw new Error('Expected the batch export to save an archive blob.');
  }

  return JSZip.loadAsync(await blob.arrayBuffer());
}

it('uses selected-page count instead of successful-package count for flat archive eligibility', async () => {
  let savedArchive: Blob | null = null;
  const deps = createDeps(async (blob) => {
    savedArchive = blob;
  });

  await startPopupExportBatch(createState(), deps, [12, 14]);

  const zip = await openSavedArchive(savedArchive);

  expect(Object.keys(zip.files)).toContain('Current_tab_2026-04-09_10-00-00.json');
  expect(Object.keys(zip.files)).not.toContain('Current_tab_2026-04-09_10-00-00/');
});
