import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { copyPopupExportPreview, getPopupExportPreviewToCopy, startPopupExport } from './actions';
import type { PopupExportRuntimeDeps, PopupExportRuntimeContract } from './types';

type PopupExportTabSelectionFixture = Pick<
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
>;

type PopupExportPreferenceFixture = Pick<
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
>;

type PopupExportSessionFixture = Omit<
  PopupExportRuntimeContract,
  keyof PopupExportTabSelectionFixture | keyof PopupExportPreferenceFixture
>;

function createTabSelectionState(): PopupExportTabSelectionFixture {
  return {
    availableTabs: [
      {
        disabledReason: null,
        isCurrent: true,
        tabId: 12,
        title: 'Current tab',
        url: 'https://example.test/current',
      },
    ],
    filterQuery: '',
    filteredTabs: [],
    isFilterActive: false,
    selectedCount: 1,
    selectedTabIds: [12],
    selectedTabIdsInOrder: [12],
    setFilterQuery: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
  };
}

function createPreferenceState(): PopupExportPreferenceFixture {
  return {
    hasLoadedPreferences: true,
    includeBasicLogs: false,
    includeCssDiagnostics: true,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
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

function createSessionState(): PopupExportSessionFixture {
  return {
    canCopyJson: true,
    canCopyMarkdown: true,
    canExport: true,
    copiedFormat: null,
    copyingFormat: null,
    copyRequestIdRef: { current: 0 },
    copyResetTimeoutRef: { current: null as number | null },
    exportDisabledReason: null as string | null,
    isExporting: false,
    progress: {
      activeStepKey: null,
      current: 0,
      errors: [],
      message: '',
      phase: 'idle',
      total: 0,
    },
    progressSteps: [],
    requestIdRef: { current: null as string | null },
    result: null,
    setCopiedFormat: vi.fn(),
    setCopyingFormat: vi.fn(),
    setProgress: vi.fn(),
    setResult: vi.fn(),
  };
}

function createMockPopupExportRuntimeContract(
  overrides: Partial<PopupExportRuntimeContract> = {}
): PopupExportRuntimeContract {
  const state: PopupExportRuntimeContract = {
    ...createTabSelectionState(),
    ...createPreferenceState(),
    ...createSessionState(),
    ...overrides,
  };

  return state;
}

function createRuntimeDeps(
  overrides: Partial<PopupExportRuntimeDeps> = {}
): PopupExportRuntimeDeps {
  const deps: PopupExportRuntimeDeps = {
    clearTimeout: vi.fn(),
    createRequestId: vi.fn(() => 'req-1'),
    getActiveTabId: vi.fn().mockResolvedValue(12),
    requestPreview: vi.fn().mockResolvedValue({
      context: 'generic',
      jsonPreview: '{"ok":true}',
      markdownPreview: '# preview',
      rowsCount: 0,
      sectionsCount: 0,
      title: 'Preview',
    }),
    saveArchiveBlob: vi.fn().mockResolvedValue(undefined),
    scheduleTimeout: vi.fn((callback) => {
      callback();
      return 7;
    }),
    sendBuildPackageMessage: vi.fn(),
    sendCancelMessage: vi.fn(),
    sendStartMessage: vi.fn().mockResolvedValue({ success: true }),
    writeClipboardText: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return deps;
}

it('reads copy preview text from the active artifact flags', () => {
  const state = createMockPopupExportRuntimeContract();
  const preview = {
    context: 'generic',
    jsonPreview: '{"ok":true}',
    markdownPreview: '# preview',
    rowsCount: 0,
    sectionsCount: 0,
    title: 'Preview',
  };

  expect(getPopupExportPreviewToCopy(state, preview, 'json')).toBe('{"ok":true}');
  expect(getPopupExportPreviewToCopy(state, preview, 'markdown')).toBe('# preview');
});

it('copies preview even when the requested format is not selected for export', async () => {
  const state = createMockPopupExportRuntimeContract({
    includeJson: false,
  });
  const deps = createRuntimeDeps();

  await copyPopupExportPreview(state, 'json', deps);

  expect(deps.writeClipboardText).toHaveBeenCalledWith('{"ok":true}');
  expect(state.setCopiedFormat).toHaveBeenCalledWith('json');
});

it('starts single-tab export through injected runtime deps', async () => {
  const state = createMockPopupExportRuntimeContract();
  const deps = createRuntimeDeps();

  await startPopupExport(state, deps);

  expect(state.requestIdRef.current).toBe('req-1');
  expect(state.setResult).toHaveBeenCalledWith(null);
  expect(state.setProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'scanning' }));
  expect(deps.sendStartMessage).toHaveBeenCalledWith(
    12,
    expect.objectContaining({
      type: MessageType.EXPORT_POPUP_START,
      requestId: 'req-1',
      options: expect.objectContaining({
        includeCssDiagnostics: true,
        includeJson: true,
      }),
    })
  );
});

it('returns early when export is blocked', async () => {
  const state = createMockPopupExportRuntimeContract({
    exportDisabledReason: 'popup.export.blocked',
  });
  const deps = createRuntimeDeps();

  await startPopupExport(state, deps);

  expect(deps.sendStartMessage).not.toHaveBeenCalled();
  expect(state.setProgress).not.toHaveBeenCalled();
});

it('returns early when export cannot start yet', async () => {
  const state = createMockPopupExportRuntimeContract({
    canExport: false,
  });
  const deps = createRuntimeDeps();

  await startPopupExport(state, deps);

  expect(state.setProgress).not.toHaveBeenCalled();
  expect(deps.sendStartMessage).not.toHaveBeenCalled();
});

it('reports a start export error when the runtime response fails', async () => {
  const state = createMockPopupExportRuntimeContract();
  const deps = createRuntimeDeps({
    sendStartMessage: vi.fn().mockResolvedValue({
      error: 'Start failed',
      success: false,
    }),
  });

  await startPopupExport(state, deps);

  expect(state.requestIdRef.current).toBeNull();
  expect(state.setProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: 'Start failed',
      phase: 'error',
    })
  );
});

it('copies preview through injected clipboard deps and resets copied state', async () => {
  const state = createMockPopupExportRuntimeContract();
  const deps = createRuntimeDeps();

  await copyPopupExportPreview(state, 'json', deps);

  expect(deps.getActiveTabId).toHaveBeenCalledTimes(1);
  expect(deps.requestPreview).toHaveBeenCalledWith(12, 'popup.export.prepareExportError');
  expect(deps.writeClipboardText).toHaveBeenCalledWith('{"ok":true}');
  expect(state.setCopiedFormat).toHaveBeenCalledWith('json');
  expect(state.setCopiedFormat).toHaveBeenLastCalledWith(null);
  expect(state.setCopyingFormat).toHaveBeenNthCalledWith(1, 'json');
  expect(state.setCopyingFormat).toHaveBeenLastCalledWith(null);
});

it('logs clipboard failures without mutating copied state', async () => {
  const error = new Error('clipboard failed');
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const state = createMockPopupExportRuntimeContract();
  const deps = createRuntimeDeps({
    writeClipboardText: vi.fn().mockRejectedValue(error),
  });

  await copyPopupExportPreview(state, 'json', deps);

  expect(state.setCopiedFormat).not.toHaveBeenCalled();
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    '[PopupExportRuntime]',
    'Failed to copy export preview',
    expect.objectContaining({ message: error.message })
  );
});
