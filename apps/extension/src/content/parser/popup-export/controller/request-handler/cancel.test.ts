import { expect, it, vi } from 'vitest';

import { handlePopupExportCancelRuntime } from './cancel';

it('cancels a running export without releasing its owner before asynchronous cleanup', () => {
  const exportRunner = { cancel: vi.fn() };
  const sendResponse = vi.fn();
  const state = { activeExportRequestId: 'req-1', isExportRunning: true };

  const handled = handlePopupExportCancelRuntime({
    exportRunId: 'req-1',
    exportRunner,
    sendResponse,
    state,
  });

  expect(handled).toBe(true);
  expect(exportRunner.cancel).toHaveBeenCalledTimes(1);
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
  expect(state).toEqual({ activeExportRequestId: 'req-1', isExportRunning: true });
});

it('aborts the matching request-scoped web snapshot operation', () => {
  const exportRunner = { cancel: vi.fn() };
  const sendResponse = vi.fn();
  const activeAbortController = new AbortController();
  const state = {
    activeAbortController,
    activeExportRequestId: 'req-web',
    isExportRunning: true,
  };

  handlePopupExportCancelRuntime({
    exportRunId: 'req-web',
    exportRunner,
    sendResponse,
    state,
  });

  expect(activeAbortController.signal.aborted).toBe(true);
  expect(state).toEqual({
    activeAbortController,
    activeExportRequestId: 'req-web',
    isExportRunning: true,
  });
});

it('does not cancel when no export is running', () => {
  const exportRunner = { cancel: vi.fn() };
  const sendResponse = vi.fn();

  const handled = handlePopupExportCancelRuntime({
    exportRunId: 'req-1',
    exportRunner,
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });

  expect(handled).toBe(true);
  expect(exportRunner.cancel).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
});

it('ignores a stale cancellation for a different export run', () => {
  const exportRunner = { cancel: vi.fn() };
  const sendResponse = vi.fn();
  const state = { activeExportRequestId: 'req-new', isExportRunning: true };

  handlePopupExportCancelRuntime({
    exportRunId: 'req-old',
    exportRunner,
    sendResponse,
    state,
  });

  expect(exportRunner.cancel).not.toHaveBeenCalled();
  expect(state).toEqual({ activeExportRequestId: 'req-new', isExportRunning: true });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
});
