import { vi } from 'vitest';
import type { PopupExportRuntimeContract } from './state';

function createRuntimeSessionState(): Pick<
  PopupExportRuntimeContract,
  | 'copiedFormat'
  | 'copyingFormat'
  | 'copyRequestIdRef'
  | 'copyResetTimeoutRef'
  | 'progress'
  | 'requestIdRef'
  | 'result'
  | 'setCopiedFormat'
  | 'setCopyingFormat'
  | 'setProgress'
  | 'setResult'
> {
  return {
    copiedFormat: null,
    copyingFormat: null,
    copyRequestIdRef: { current: 0 },
    copyResetTimeoutRef: { current: null },
    progress: { activeStepKey: null, current: 0, errors: [], message: '', phase: 'idle', total: 0 },
    requestIdRef: { current: null },
    result: null,
    setCopiedFormat: vi.fn(),
    setCopyingFormat: vi.fn(),
    setProgress: vi.fn(),
    setResult: vi.fn(),
  };
}

function createRuntimeToggleState(): Pick<
  PopupExportRuntimeContract,
  | 'hasLoadedPreferences'
  | 'includeBasicLogs'
  | 'includeCssDiagnostics'
  | 'includeFiles'
  | 'includeFullPageScreenshot'
  | 'includeHarDomLogs'
  | 'includeImages'
  | 'includeJson'
  | 'includeMarkdown'
  | 'setIncludeBasicLogs'
  | 'setIncludeCssDiagnostics'
  | 'setIncludeFiles'
  | 'setIncludeFullPageScreenshot'
  | 'setIncludeHarDomLogs'
  | 'setIncludeImages'
  | 'setIncludeJson'
  | 'setIncludeMarkdown'
> {
  return {
    hasLoadedPreferences: true,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
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
