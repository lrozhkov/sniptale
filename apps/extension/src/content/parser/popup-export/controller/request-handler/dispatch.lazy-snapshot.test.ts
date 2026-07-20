import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

function createExportOptions() {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createRuntime() {
  return {
    emitMessage: vi.fn(),
    exportRunner: {
      buildPackage: vi.fn(),
      cancel: vi.fn(),
      export: vi.fn(),
      onProgress: vi.fn(),
    },
    parseTree: vi.fn(),
    persistArchive: vi.fn(),
    state: {
      activeExportRequestId: null,
      isExportRunning: false,
    },
  };
}

it('does not load content-only web snapshot capture code for ordinary export routes', async () => {
  const handlePopupExportStartRuntime = vi.fn(() => true);
  vi.doMock('../start/runtime', () => ({ handlePopupExportStartRuntime }));
  vi.doMock('../snapshot', () => {
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
        requestId: 'req-1',
        type: MessageType.EXPORT_POPUP_START,
      },
      sendResponse,
    })
  ).toBe(true);
  expect(handlePopupExportStartRuntime).toHaveBeenCalledOnce();
});
