import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import {
  applyBatchExportResult,
  finishEmptyBatchExport,
  getSelectedBatchTabs,
  isCurrentBatchRequest,
  setBatchExportProgress,
  setBatchSaveFailureProgress,
} from './batch-state';

function createPagePackage(
  overrides: Partial<{
    filesCount: number;
    filesFailed: number;
    rowsCount: number;
    sectionsCount: number;
  }> = {}
) {
  return {
    archiveBaseName: 'page_export',
    entries: [{ path: 'page.json', textContent: '{}' }],
    errors: [],
    stats: {
      filesCount: overrides.filesCount ?? 1,
      filesFailed: overrides.filesFailed ?? 0,
      rowsCount: overrides.rowsCount ?? 2,
      sectionsCount: overrides.sectionsCount ?? 1,
    },
  };
}

function createState() {
  return {
    availableTabs: [
      {
        disabledReason: null,
        isCurrent: true,
        tabId: 1,
        title: 'Current tab',
        url: 'https://example.test/current',
      },
      {
        disabledReason: null,
        isCurrent: false,
        tabId: 2,
        title: 'Second tab',
        url: 'https://example.test/second',
      },
      { disabledReason: null, isCurrent: false, tabId: null, title: 'Fallback tab', url: null },
    ],
    requestIdRef: { current: 'req-1' as string | null },
    setProgress: vi.fn(),
    setResult: vi.fn(),
  };
}

describe('batch-state selection helpers', () => {
  it('detects the current request, filters selectable tabs, and sets batch progress', () => {
    const state = createState();

    expect(isCurrentBatchRequest(state as never, 'req-1')).toBe(true);
    expect(isCurrentBatchRequest(state as never, 'req-2')).toBe(false);
    expect(getSelectedBatchTabs(state as never, [2, 3]).map((tab) => tab.tabId)).toEqual([2]);

    setBatchExportProgress(state as never, 1, 3, 'progress', 'downloading');

    expect(state.setProgress).toHaveBeenCalledWith({
      activeStepKey: null,
      current: 1,
      errors: [],
      message: 'progress',
      phase: 'downloading',
      total: 3,
    });
  });
});

describe('batch-state empty result reducer', () => {
  it('surfaces an empty batch result with the fallback message when no errors exist', () => {
    const state = createState();
    const onEmptyResult = vi.fn();

    finishEmptyBatchExport({
      errors: [],
      onEmptyResult,
      requestId: 'req-1',
      selectedCount: 2,
      state: state as never,
      total: 2,
    });

    expect(onEmptyResult).toHaveBeenCalledWith({
      errorCount: 0,
      requestId: 'req-1',
      selectedCount: 2,
    });
    expect(state.requestIdRef.current).toBeNull();
    expect(state.setResult).toHaveBeenCalledWith({
      success: false,
      errors: [],
      stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
    });
    expect(state.setProgress).toHaveBeenCalledWith({
      activeStepKey: null,
      current: 0,
      errors: [],
      message: 'popup.export.startExportError',
      phase: 'error',
      total: 2,
    });
  });
});

describe('batch-state save failure reducer', () => {
  it('deduplicates archive save failure messages and falls back for non-Error values', () => {
    const state = createState();
    const pagePackages = [{ pagePackage: createPagePackage(), tabId: 1, tabTitle: 'Current tab' }];

    setBatchSaveFailureProgress({
      error: 'not-an-error-instance',
      errors: ['popup.export.startExportError', 'secondary'],
      pagePackages,
      state: state as never,
    });

    expect(state.requestIdRef.current).toBeNull();
    expect(state.setResult).toHaveBeenCalledWith({
      success: false,
      errors: ['popup.export.startExportError', 'secondary'],
      stats: { filesCount: 1, filesFailed: 0, rowsCount: 2, sectionsCount: 1 },
    });
    expect(state.setProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: ['popup.export.startExportError', 'secondary'],
        message: 'popup.export.startExportError',
      })
    );
  });
});

describe('batch-state final result reducer', () => {
  it('applies success and failure batch export results with matching progress phases', () => {
    const successState = createState();
    const errorState = createState();
    const pagePackages = [
      { pagePackage: createPagePackage({ rowsCount: 4 }), tabId: 1, tabTitle: 'Current tab' },
    ];

    applyBatchExportResult({
      errors: [],
      filename: 'pages_export_success.zip',
      pagePackages,
      state: successState as never,
    });
    applyBatchExportResult({
      errors: ['Current tab: failed'],
      filename: 'pages_export_error.zip',
      pagePackages,
      state: errorState as never,
    });

    expect(successState.setResult).toHaveBeenCalledWith({
      success: true,
      filename: 'pages_export_success.zip',
      errors: [],
      stats: { filesCount: 1, filesFailed: 0, rowsCount: 4, sectionsCount: 1 },
    });
    expect(successState.setProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'popup.export.batchCompletedMessage',
        phase: 'done',
      })
    );
    expect(errorState.setProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Current tab: failed',
        phase: 'error',
      })
    );
  });
});
