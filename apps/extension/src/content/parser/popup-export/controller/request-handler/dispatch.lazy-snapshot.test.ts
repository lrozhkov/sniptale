import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

function createExportOptions() {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createRuntime() {
  return {
    exportRunner: {
      buildPackage: vi.fn().mockResolvedValue({}),
      cancel: vi.fn(),
    },
    parseTree: vi.fn(),
    state: {
      activeExportRequestId: null,
      isExportRunning: false,
    },
  };
}

it('does not load content-only web snapshot capture code for package routes', async () => {
  vi.doMock('../web-snapshot-runtime', () => {
    throw new Error('content-only snapshot branch loaded');
  });

  const { dispatchPopupExportRequest } = await import('./dispatch');
  const runtime = createRuntime();
  const sendResponse = vi.fn();

  expect(
    dispatchPopupExportRequest({
      ...runtime,
      request: {
        options: createExportOptions(),
        batchRequestId: 'req-1',
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      },
      sendResponse,
    })
  ).toBe(true);
  expect(runtime.exportRunner.buildPackage).toHaveBeenCalledOnce();
});
