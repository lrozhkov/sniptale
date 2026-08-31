import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createPopupExportRequestHandler } from './runtime';
const dispatchPopupExportRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./dispatch', () => ({
  dispatchPopupExportRequest: dispatchPopupExportRequestMock,
}));

function createRuntime() {
  return {
    exportRunner: {
      buildBlobPackage: vi.fn(),
      buildPackage: vi.fn(),
      cancel: vi.fn(),
    },
    parseTree: vi.fn(),
    state: {
      activeExportRequestId: null,
      isExportRunning: false,
    },
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

it('routes cancel requests and only cancels when running', () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  dispatchPopupExportRequestMock.mockReturnValue(true);
  const handleRequest = createPopupExportRequestHandler(runtime);

  expect(
    handleRequest(
      { exportRunId: 'export-run-1', type: MessageType.EXPORT_POPUP_CANCEL },
      sendResponse
    )
  ).toBe(true);
  expect(dispatchPopupExportRequestMock).toHaveBeenCalledWith({
    ...runtime,
    request: { exportRunId: 'export-run-1', type: MessageType.EXPORT_POPUP_CANCEL },
    sendResponse,
  });
});
