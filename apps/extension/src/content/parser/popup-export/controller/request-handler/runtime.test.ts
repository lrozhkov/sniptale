import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createPopupExportRequestHandler } from './runtime';
const dispatchPopupExportRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./dispatch', () => ({
  dispatchPopupExportRequest: dispatchPopupExportRequestMock,
}));

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

it('routes preview requests to the preview responder', () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  dispatchPopupExportRequestMock.mockReturnValue(true);

  const handleRequest = createPopupExportRequestHandler(runtime);

  expect(handleRequest({ type: MessageType.EXPORT_POPUP_PREVIEW }, sendResponse)).toBe(true);
  expect(dispatchPopupExportRequestMock).toHaveBeenCalledWith({
    ...runtime,
    request: { type: MessageType.EXPORT_POPUP_PREVIEW },
    sendResponse,
  });
});

it('routes start requests to the start handler', () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  dispatchPopupExportRequestMock.mockReturnValue(true);

  const handleRequest = createPopupExportRequestHandler(runtime);

  expect(
    handleRequest(
      {
        type: MessageType.EXPORT_POPUP_START,
        options: createExportOptions(),
        requestId: 'req-1',
      },
      sendResponse
    )
  ).toBe(true);
  expect(dispatchPopupExportRequestMock).toHaveBeenCalledWith({
    ...runtime,
    request: {
      options: createExportOptions(),
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_START,
    },
    sendResponse,
  });
});

it('routes cancel requests and only cancels when running', () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  dispatchPopupExportRequestMock.mockReturnValue(true);
  const handleRequest = createPopupExportRequestHandler(runtime);

  expect(handleRequest({ type: MessageType.EXPORT_POPUP_CANCEL }, sendResponse)).toBe(true);
  expect(dispatchPopupExportRequestMock).toHaveBeenCalledWith({
    ...runtime,
    request: { type: MessageType.EXPORT_POPUP_CANCEL },
    sendResponse,
  });
});
