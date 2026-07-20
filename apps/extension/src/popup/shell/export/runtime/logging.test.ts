import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: mocks.debug,
    error: mocks.error,
  }),
}));

import {
  logPopupExportBatchArchiveSaveFailure,
  logPopupExportBatchArchiveSaveStart,
  logPopupExportBatchArchiveSaveSuccess,
  logPopupExportBatchEmptyResult,
  logPopupExportBatchStart,
  logPopupExportBatchStale,
  logPopupExportBatchTabRequest,
  logPopupExportBatchTabResult,
  logPopupExportBatchUnexpectedFailure,
  logPopupExportCancelFailure,
  logPopupExportCopyFailure,
} from './logging';

describe('popup export runtime failure logging', () => {
  it('logs copy and cancel failures through the popup runtime logger', () => {
    const copyError = new Error('copy failed');
    const cancelError = new Error('cancel failed');

    logPopupExportCopyFailure(copyError);
    logPopupExportCancelFailure(cancelError);

    expect(mocks.error).toHaveBeenNthCalledWith(1, 'Failed to copy export preview', copyError);
    expect(mocks.error).toHaveBeenNthCalledWith(2, 'Failed to cancel export', cancelError);
  });
});

describe('popup export runtime batch logging payloads', () => {
  it('logs safe batch export debug events without payload content', () => {
    logPopupExportBatchStart({ requestId: 'req-1', selectedCount: 2 });
    logPopupExportBatchTabRequest({ index: 1, requestId: 'req-1', tabId: 11, total: 2 });
    logPopupExportBatchTabResult({
      error: 'boom',
      hasPagePackage: false,
      index: 1,
      requestId: 'req-1',
      success: false,
      tabId: 11,
      total: 2,
    });
    logPopupExportBatchArchiveSaveStart({ pageCount: 2, requestId: 'req-1' });
    logPopupExportBatchArchiveSaveSuccess({ pageCount: 2, requestId: 'req-1' });
    logPopupExportBatchArchiveSaveFailure({
      error: 'save failed',
      pageCount: 2,
      requestId: 'req-1',
    });
    logPopupExportBatchEmptyResult({ errorCount: 2, requestId: 'req-1', selectedCount: 2 });
    logPopupExportBatchStale({ phase: 'collect', requestId: 'req-1' });
    logPopupExportBatchUnexpectedFailure({
      error: new Error('unexpected'),
      index: 2,
      requestId: 'req-1',
      tabId: 12,
      total: 2,
    });

    expect(mocks.debug).toHaveBeenCalledWith('Popup batch export started', {
      requestId: 'req-1',
      selectedCount: 2,
    });
    expect(mocks.debug).toHaveBeenCalledWith('Popup batch export tab package failed unexpectedly', {
      error: 'unexpected',
      index: 2,
      requestId: 'req-1',
      tabId: 12,
      total: 2,
    });
  });
});

describe('popup export runtime batch logging fallbacks', () => {
  it('omits unexpected failure message details for non-Error values', () => {
    logPopupExportBatchUnexpectedFailure({
      error: 'unexpected',
      index: 1,
      requestId: 'req-2',
      tabId: 22,
      total: 3,
    });

    expect(mocks.debug).toHaveBeenCalledWith('Popup batch export tab package failed unexpectedly', {
      error: undefined,
      index: 1,
      requestId: 'req-2',
      tabId: 22,
      total: 3,
    });
  });
});
