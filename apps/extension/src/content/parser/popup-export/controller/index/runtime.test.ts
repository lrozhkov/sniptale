import { expect, it, vi } from 'vitest';

import { createPopupExportControllerRuntime } from './runtime';

function createRuntime() {
  return createPopupExportControllerRuntime({
    exportRunner: {
      buildBlobPackage: vi.fn(),
      buildPackage: vi.fn(),
      cancel: vi.fn(),
    },
    parseTree: vi.fn(),
  });
}

it('disposes idle popup-export runtime without cancelling export runner', () => {
  const runtime = createRuntime();

  runtime.state.activeExportRequestId = 'request-1';
  runtime.dispose();

  expect(runtime.exportRunner.cancel).not.toHaveBeenCalled();
  expect(runtime.state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });
});

it('disposes running popup-export runtime and cancels export runner', () => {
  const runtime = createRuntime();

  runtime.state.activeExportRequestId = 'request-2';
  runtime.state.isExportRunning = true;

  runtime.dispose();

  expect(runtime.exportRunner.cancel).toHaveBeenCalledOnce();
  expect(runtime.state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });
});
