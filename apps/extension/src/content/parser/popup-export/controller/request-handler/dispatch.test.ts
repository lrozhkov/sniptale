import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { dispatchPopupExportRequest } from './dispatch';

const respondWithPopupPreviewMock = vi.hoisted(() => vi.fn());
const handlePopupExportBuildPackageRuntimeMock = vi.hoisted(() => vi.fn());
const handlePopupExportCancelRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock('../preview', () => ({
  respondWithPopupPreview: respondWithPopupPreviewMock,
}));

vi.mock('../package', () => ({
  handlePopupExportBuildPackageRuntime: handlePopupExportBuildPackageRuntimeMock,
}));

vi.mock('./cancel', () => ({
  handlePopupExportCancelRuntime: handlePopupExportCancelRuntimeMock,
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
      activeExportRequestId: null as string | null,
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
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

it('routes preview requests to the preview responder', () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();

  expect(
    dispatchPopupExportRequest({
      ...runtime,
      request: { type: MessageType.EXPORT_POPUP_PREVIEW },
      sendResponse,
    })
  ).toBe(true);
  expect(respondWithPopupPreviewMock).toHaveBeenCalledWith({
    parseTree: runtime.parseTree,
    sendResponse,
  });
});

it('routes build-package requests to the package handler', () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  handlePopupExportBuildPackageRuntimeMock.mockReturnValue(true);

  expect(
    dispatchPopupExportRequest({
      ...runtime,
      request: {
        batchRequestId: 'batch-1',
        includeWebCopy: false,
        intent: 'export',
        ordinal: 0,
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        options: createExportOptions(),
      },
      sendResponse,
    })
  ).toBe(true);
  expect(handlePopupExportBuildPackageRuntimeMock).toHaveBeenCalledWith({
    ...runtime,
    request: {
      batchRequestId: 'batch-1',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    },
    sendResponse,
  });
});

it('routes cancel requests to the cancel handler', () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  handlePopupExportCancelRuntimeMock.mockReturnValue(true);

  expect(
    dispatchPopupExportRequest({
      ...runtime,
      request: { exportRunId: 'export-run-1', type: MessageType.EXPORT_POPUP_CANCEL },
      sendResponse,
    })
  ).toBe(true);
  expect(handlePopupExportCancelRuntimeMock).toHaveBeenCalledWith({
    exportRunId: 'export-run-1',
    exportRunner: runtime.exportRunner,
    sendResponse,
    state: runtime.state,
  });
});
