import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { dispatchPopupExportRequest } from './dispatch';

const respondWithPopupPreviewMock = vi.hoisted(() => vi.fn());
const handlePopupExportBuildPackageRuntimeMock = vi.hoisted(() => vi.fn());
const handlePopupExportStartRuntimeMock = vi.hoisted(() => vi.fn());
const handlePopupExportCancelRuntimeMock = vi.hoisted(() => vi.fn());
const handlePopupWebSnapshotRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock('../preview', () => ({
  respondWithPopupPreview: respondWithPopupPreviewMock,
}));

vi.mock('../start/runtime', () => ({
  handlePopupExportStartRuntime: handlePopupExportStartRuntimeMock,
}));

vi.mock('../package', () => ({
  handlePopupExportBuildPackageRuntime: handlePopupExportBuildPackageRuntimeMock,
}));

vi.mock('../snapshot', () => ({
  handlePopupWebSnapshotRuntime: handlePopupWebSnapshotRuntimeMock,
}));

vi.mock('./cancel', () => ({
  handlePopupExportCancelRuntime: handlePopupExportCancelRuntimeMock,
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

it('routes start requests to the start handler', () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  handlePopupExportStartRuntimeMock.mockReturnValue(true);

  expect(
    dispatchPopupExportRequest({
      ...runtime,
      request: {
        type: MessageType.EXPORT_POPUP_START,
        options: createExportOptions(),
        requestId: 'req-1',
      },
      sendResponse,
    })
  ).toBe(true);
  expect(handlePopupExportStartRuntimeMock).toHaveBeenCalledWith({
    ...runtime,
    request: {
      options: createExportOptions(),
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_START,
    },
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
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        options: createExportOptions(),
      },
      sendResponse,
    })
  ).toBe(true);
  expect(handlePopupExportBuildPackageRuntimeMock).toHaveBeenCalledWith({
    ...runtime,
    request: {
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
      request: { type: MessageType.EXPORT_POPUP_CANCEL },
      sendResponse,
    })
  ).toBe(true);
  expect(handlePopupExportCancelRuntimeMock).toHaveBeenCalledWith({
    exportRunner: runtime.exportRunner,
    sendResponse,
    state: runtime.state,
  });
});

it('routes web snapshot requests to the snapshot handler', async () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  handlePopupWebSnapshotRuntimeMock.mockReturnValue(true);

  expect(
    dispatchPopupExportRequest({
      ...runtime,
      request: {
        allowAnonymousCrossOriginAssets: true,
        allowAuthenticatedSameOriginAssets: false,
        requestId: 'req-web',
        type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
      },
      sendResponse,
    })
  ).toBe(true);
  await vi.waitFor(() => {
    expect(handlePopupWebSnapshotRuntimeMock).toHaveBeenCalledWith(
      sendResponse,
      'req-web',
      false,
      true
    );
  });
});
