import { vi } from 'vitest';
import type { PopupExportRuntimeContract } from '../state';
import type { PopupExportBatchPackage, PopupExportRuntimeDeps } from '../types';

export function createPagePackage(): PopupExportBatchPackage {
  return {
    pagePackage: {
      archiveBaseName: 'page_export',
      entries: [{ path: 'page.json', textContent: '{}' }],
      errors: [],
      stats: { filesCount: 1, filesFailed: 0, rowsCount: 2, sectionsCount: 1 },
    },
    tabId: 1,
    tabTitle: 'Current tab',
  };
}

export function createDeps(
  overrides: Partial<PopupExportRuntimeDeps> = {}
): PopupExportRuntimeDeps {
  return {
    clearTimeout: vi.fn(),
    createRequestId: vi.fn(() => 'req-1'),
    getActiveTabId: vi.fn().mockResolvedValue(1),
    requestPreview: vi.fn(),
    saveArchiveBlob: vi.fn().mockResolvedValue(undefined),
    scheduleTimeout: vi.fn(() => 1),
    sendBuildPackageMessage: vi.fn(),
    sendCancelMessage: vi.fn(),
    sendStartMessage: vi.fn(),
    writeClipboardText: vi.fn(),
    ...overrides,
  };
}

function createToggleState() {
  return {
    hasLoadedPreferences: true,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: true,
    setIncludeBasicLogs: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludeHarDomLogs: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
  };
}

function createSessionState() {
  return {
    copiedFormat: null,
    copyingFormat: null,
    copyRequestIdRef: { current: 1 },
    copyResetTimeoutRef: { current: null },
    progress: { current: 0, errors: [], message: '', phase: 'idle' as const, total: 0 },
    requestIdRef: { current: 'req-1' },
    result: null,
    setCopiedFormat: vi.fn(),
    setCopyingFormat: vi.fn(),
    setProgress: vi.fn(),
    setResult: vi.fn(),
  };
}

function createSelectionState() {
  return {
    availableTabs: [],
    filterQuery: '',
    filteredTabs: [],
    isFilterActive: false,
    selectedCount: 0,
    selectedTabIds: [],
    selectedTabIdsInOrder: [],
    setFilterQuery: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
  };
}

function createDerivedState() {
  return {
    canCopyJson: false,
    canCopyMarkdown: false,
    canExport: false,
    exportDisabledReason: null,
    isExporting: false,
    progressSteps: [],
  };
}

export function createState(): PopupExportRuntimeContract {
  return {
    ...createToggleState(),
    ...createSessionState(),
    ...createSelectionState(),
    ...createDerivedState(),
  };
}

export function createArchiveFailureArgs(
  saveArchiveBlob: PopupExportRuntimeDeps['saveArchiveBlob']
) {
  return {
    deps: createDeps({ saveArchiveBlob }),
    errors: ['tab error'],
    layout: 'grouped' as const,
    pagePackages: [createPagePackage()],
    requestId: 'req-1',
    state: createState(),
  };
}

export type { PopupExportRuntimeDeps };
