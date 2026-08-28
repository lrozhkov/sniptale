import { vi } from 'vitest';
import type { PopupExportRuntimeContract } from './state';

function createRuntimeSessionState(): Pick<
  PopupExportRuntimeContract,
  | 'copiedFormat'
  | 'copyingFormat'
  | 'cancelRetryRef'
  | 'copyRequestIdRef'
  | 'copyResetTimeoutRef'
  | 'progress'
  | 'requestIdRef'
  | 'terminalRequestIdRef'
  | 'result'
  | 'setCopiedFormat'
  | 'setCopyingFormat'
  | 'setProgress'
  | 'setResult'
  | 'launchedPlan'
  | 'setLaunchedPlan'
> {
  return {
    copiedFormat: null,
    copyingFormat: null,
    cancelRetryRef: { current: null },
    copyRequestIdRef: { current: 0 },
    copyResetTimeoutRef: { current: null },
    progress: { activeStepKey: null, current: 0, errors: [], message: '', phase: 'idle', total: 0 },
    requestIdRef: { current: null },
    terminalRequestIdRef: { current: null },
    result: null,
    launchedPlan: null,
    setCopiedFormat: vi.fn(),
    setCopyingFormat: vi.fn(),
    setProgress: vi.fn(),
    setResult: vi.fn(),
    setLaunchedPlan: vi.fn(),
  };
}

function createRuntimeToggleState(): Pick<
  PopupExportRuntimeContract,
  | 'hasLoadedPreferences'
  | 'includeAnnotations'
  | 'includeBasicLogs'
  | 'includeCssDiagnostics'
  | 'includeFiles'
  | 'includeFullPageScreenshot'
  | 'includePageDiagnostics'
  | 'includeImages'
  | 'includeJson'
  | 'includeMarkdown'
  | 'includeWebCopy'
  | 'saveSelection'
  | 'setIncludeBasicLogs'
  | 'setIncludeAnnotations'
  | 'setIncludeCssDiagnostics'
  | 'setIncludeFiles'
  | 'setIncludeFullPageScreenshot'
  | 'setIncludePageDiagnostics'
  | 'setIncludeImages'
  | 'setIncludeJson'
  | 'setIncludeMarkdown'
> {
  return {
    hasLoadedPreferences: true,
    includeAnnotations: false,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includePageDiagnostics: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    includeWebCopy: false,
    saveSelection: {
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
      includeWebCopy: true,
    },
    setIncludeBasicLogs: vi.fn(),
    setIncludeAnnotations: vi.fn(),
    setIncludeCssDiagnostics: vi.fn(),
    setIncludeFiles: vi.fn(),
    setIncludeFullPageScreenshot: vi.fn(),
    setIncludePageDiagnostics: vi.fn(),
    setIncludeImages: vi.fn(),
    setIncludeJson: vi.fn(),
    setIncludeMarkdown: vi.fn(),
  };
}

function createRuntimeTabState(): Pick<
  PopupExportRuntimeContract,
  | 'availableTabs'
  | 'filterQuery'
  | 'filteredTabs'
  | 'isFilterActive'
  | 'selectedCount'
  | 'selectedTabIds'
  | 'selectedTabIdsInOrder'
  | 'setFilterQuery'
  | 'toggleSelectAllTabs'
  | 'toggleTabSelection'
> {
  return {
    availableTabs: [],
    filterQuery: '',
    filteredTabs: [],
    isFilterActive: false,
    selectedCount: 1,
    selectedTabIds: [11],
    selectedTabIdsInOrder: [11],
    setFilterQuery: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
  };
}

function createRuntimeDerivedState(): Pick<
  PopupExportRuntimeContract,
  | 'canCopyJson'
  | 'canCopyMarkdown'
  | 'canExport'
  | 'exportDisabledReason'
  | 'isExporting'
  | 'progressSteps'
> {
  return {
    canCopyJson: true,
    canCopyMarkdown: true,
    canExport: true,
    exportDisabledReason: null,
    isExporting: false,
    progressSteps: [],
  };
}

export function createPopupExportRuntimeStateFixture(
  overrides: Partial<PopupExportRuntimeContract> = {}
): PopupExportRuntimeContract {
  return {
    ...createRuntimeDerivedState(),
    ...createRuntimeSessionState(),
    ...createRuntimeTabState(),
    ...createRuntimeToggleState(),
    ...overrides,
  };
}
