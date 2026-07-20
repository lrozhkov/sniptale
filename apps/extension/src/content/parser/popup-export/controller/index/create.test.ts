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
    buildPackage: vi.fn(),
    cancel: vi.fn(),
    export: vi.fn().mockResolvedValue({
      blob: new Blob(['zip'], { type: 'application/zip' }),
      errors: [],
      filename: 'popup-export.zip',
      stats: {},
      success: true,
    }),
    onProgress: vi.fn(),
  };
  const controller = createPopupExportController({
    emitMessage: vi.fn(),
    exportRunner: exportRunner as never,
    parseTree: vi.fn(),
    persistArchive: vi.fn().mockResolvedValue([]),
  });

  expect(
    controller.handleRequest(
      {
        options: {
          includeBasicLogs: true,
          includeCssDiagnostics: false,
          includeFiles: false,
          includeFullPageScreenshot: false,
          includeHarDomLogs: false,
          includeImages: false,
          includeJson: true,
          includeMarkdown: false,
        },
        requestId: 'request-1',
        type: MessageType.EXPORT_POPUP_START,
      },
      vi.fn()
    )
  ).toBe(true);

  controller.dispose();

  expect(exportRunner.cancel).toHaveBeenCalledOnce();
});
