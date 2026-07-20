import { expect, it, vi } from 'vitest';

import { handlePopupExportCancelRuntime } from './cancel';

it('cancels a running export and always acknowledges the request', () => {
  const exportRunner = { cancel: vi.fn() };
  const sendResponse = vi.fn();
  const state = { activeExportRequestId: 'req-1', isExportRunning: true };

  const handled = handlePopupExportCancelRuntime({
    exportRunner,
    sendResponse,
    state,
  });

  expect(handled).toBe(true);
  expect(exportRunner.cancel).toHaveBeenCalledTimes(1);
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
  expect(state).toEqual({ activeExportRequestId: null, isExportRunning: false });
});

it('does not cancel when no export is running', () => {
  const exportRunner = { cancel: vi.fn() };
  const sendResponse = vi.fn();

  const handled = handlePopupExportCancelRuntime({
    exportRunner,
    sendResponse,
    state: { activeExportRequestId: null, isExportRunning: false },
  });

  expect(handled).toBe(true);
  expect(exportRunner.cancel).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
});
