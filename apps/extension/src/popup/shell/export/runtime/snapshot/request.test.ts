import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { requestSaveWebSnapshot } from './request';
import type { PopupExportRuntimeDeps, PopupExportRuntimeContract } from '../types';

function createState(): PopupExportRuntimeContract {
  return {
    canExport: true,
    canCopyJson: true,
    canCopyMarkdown: true,
    copiedFormat: null,
    copyingFormat: null,
    exportDisabledReason: null,
    isExporting: false,
    progress: { current: 0, errors: [], message: '', phase: 'idle', total: 0 },
    progressSteps: [],
    requestIdRef: { current: null },
    result: null,
    availableTabs: [],
    copyRequestIdRef: { current: 0 },
    copyResetTimeoutRef: { current: null },
    hasLoadedPreferences: true,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
    setCopiedFormat: vi.fn(),
    setCopyingFormat: vi.fn(),
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
    filterQuery: '',
    filteredTabs: [],
    isFilterActive: false,
    selectedCount: 1,
    selectedTabIds: [1],
    selectedTabIdsInOrder: [1],
    setFilterQuery: vi.fn(),
    toggleSelectAllTabs: vi.fn(),
    toggleTabSelection: vi.fn(),
  };
}

function createDeps(response: unknown): PopupExportRuntimeDeps {
  return {
    clearTimeout: vi.fn(),
    createRequestId: () => 'req-1',
    getActiveTabId: vi.fn(),
    requestPreview: vi.fn(),
    saveArchiveBlob: vi.fn(),
    scheduleTimeout: vi.fn(),
    sendBuildPackageMessage: vi.fn(),
    sendCancelMessage: vi.fn(),
    sendSaveWebSnapshotMessage: vi.fn(async () => response),
    sendStartMessage: vi.fn(),
    writeClipboardText: vi.fn(),
  } as unknown as PopupExportRuntimeDeps;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('saves a web snapshot and ignores stale results', async () => {
  const state = createState();
  const deps = createDeps({ assetId: 'snapshot-1', success: true, warnings: ['missing asset'] });

  await requestSaveWebSnapshot(state, 5, deps);

  expect(deps.sendSaveWebSnapshotMessage).toHaveBeenCalledWith(5, {
    requestId: 'req-1',
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  });
  expect(state.setResult).toHaveBeenCalledWith(
    expect.objectContaining({
      filename: 'Веб-снимок сохранён в Галерею с предупреждениями',
      kind: 'webSnapshot',
      warnings: ['missing asset'],
    })
  );
});

it('surfaces snapshot save failures symmetrically', async () => {
  const state = createState();
  const deps = createDeps({ error: 'denied', success: false });

  await expect(requestSaveWebSnapshot(state, 5, deps)).rejects.toThrow('denied');
  expect(state.setProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'error' }));
});

it('rejects successful snapshot responses without an asset id', async () => {
  const state = createState();
  const deps = createDeps({ success: true, warnings: [] });

  await expect(requestSaveWebSnapshot(state, 5, deps)).rejects.toThrow(
    'Веб-снимок сохранён без идентификатора'
  );
  expect(state.setResult).not.toHaveBeenCalled();
});
