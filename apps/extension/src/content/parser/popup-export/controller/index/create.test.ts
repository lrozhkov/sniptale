import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createPopupExportController } from './create';

it('keeps the popup-export controller facade stable and working', async () => {
  const parseTree = vi.fn().mockResolvedValue({
    context: 'ctx',
    structure: [],
    title: 'Popup',
  });
  const sendResponse = vi.fn();

  expect(
    createPopupExportController({ parseTree }).handleRequest(
      { type: MessageType.EXPORT_POPUP_PREVIEW },
      sendResponse
    )
  ).toBe(true);

  await Promise.resolve();

  expect(parseTree).toHaveBeenCalledWith('popup-export-preview');
  expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

it('cancels running exports on dispose and resets the state', () => {
  const exportRunner = {
    cancel: vi.fn(),
    buildBlobPackage: vi.fn(() => new Promise(() => undefined)),
    buildPackage: vi.fn(),
  };
  const controller = createPopupExportController({
    exportRunner: exportRunner as never,
    parseTree: vi.fn(),
  });

  expect(
    controller.handleRequest(
      {
        options: {
          includeBasicLogs: true,
          includeCssDiagnostics: false,
          includeFiles: false,
          includeFullPageScreenshot: false,
          includePageDiagnostics: false,
          includeImages: false,
          includeJson: true,
          includeMarkdown: false,
        },
        batchRequestId: 'request-1',
        includeWebCopy: false,
        intent: 'export',
        ordinal: 0,
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      },
      vi.fn()
    )
  ).toBe(true);

  controller.dispose();

  expect(exportRunner.cancel).toHaveBeenCalledOnce();
});
