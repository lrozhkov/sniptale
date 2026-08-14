import { expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { dispatchPopupExportRequest } from './dispatch';

const respondWithPopupPreviewMock = vi.hoisted(() => vi.fn());
const handlePopupExportBuildPackageRuntimeMock = vi.hoisted(() => vi.fn());
const handlePopupExportCancelRuntimeMock = vi.hoisted(() => vi.fn());
const handlePopupWebSnapshotRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock('../preview', () => ({
  respondWithPopupPreview: respondWithPopupPreviewMock,
}));

vi.mock('../package', () => ({
  handlePopupExportBuildPackageRuntime: handlePopupExportBuildPackageRuntimeMock,
}));

vi.mock('../web-snapshot-runtime', () => ({
  handlePopupWebSnapshotRuntime: handlePopupWebSnapshotRuntimeMock,
}));

vi.mock('./cancel', () => ({
  handlePopupExportCancelRuntime: handlePopupExportCancelRuntimeMock,
}));

function createRuntime() {
  return {
    exportRunner: {
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
      true,
      undefined,
      undefined,
      expect.any(AbortSignal),
      expect.any(Function)
    );
  });
  expect(runtime.state).toEqual(
    expect.objectContaining({ activeExportRequestId: 'req-web', isExportRunning: true })
  );
  const settle = handlePopupWebSnapshotRuntimeMock.mock.calls.at(-1)?.[7] as
    | (() => void)
    | undefined;
  settle?.();
  expect(runtime.state).toEqual({ activeExportRequestId: null, isExportRunning: false });
});

it('rejects a concurrent web snapshot without replacing the active request', () => {
  const runtime = createRuntime();
  runtime.state.activeExportRequestId = 'req-active';
  runtime.state.isExportRunning = true;
  const sendResponse = vi.fn();

  expect(
    dispatchPopupExportRequest({
      ...runtime,
      request: {
        allowAnonymousCrossOriginAssets: false,
        allowAuthenticatedSameOriginAssets: false,
        requestId: 'req-concurrent',
        type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
      },
      sendResponse,
    })
  ).toBe(true);

  expect(handlePopupWebSnapshotRuntimeMock).not.toHaveBeenCalledWith(
    expect.anything(),
    'req-concurrent',
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.anything()
  );
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: false, warnings: [] })
  );
  expect(runtime.state).toEqual({ activeExportRequestId: 'req-active', isExportRunning: true });
});

it('settles state and reports a lazy web snapshot runtime failure', async () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  handlePopupWebSnapshotRuntimeMock.mockImplementationOnce(() => {
    throw new Error('runtime failed');
  });

  dispatchPopupExportRequest({
    ...runtime,
    request: {
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-failed',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    },
    sendResponse,
  });

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'load web snapshot export module: runtime failed',
      success: false,
      warnings: [],
    });
  });
  expect(runtime.state).toEqual({ activeExportRequestId: null, isExportRunning: false });
});

it('does not let a stale web snapshot settlement clear a newer active request', async () => {
  const runtime = createRuntime();
  const callCount = handlePopupWebSnapshotRuntimeMock.mock.calls.length;

  dispatchPopupExportRequest({
    ...runtime,
    request: {
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-stale',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    },
    sendResponse: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(handlePopupWebSnapshotRuntimeMock.mock.calls.length).toBe(callCount + 1);
  });
  const settle = handlePopupWebSnapshotRuntimeMock.mock.calls.at(-1)?.[7] as
    | (() => void)
    | undefined;
  runtime.state.activeExportRequestId = 'req-new';
  settle?.();

  expect(runtime.state).toEqual(
    expect.objectContaining({ activeExportRequestId: 'req-new', isExportRunning: true })
  );
});

it('normalizes a non-error lazy web snapshot runtime failure', async () => {
  const runtime = createRuntime();
  const sendResponse = vi.fn();
  handlePopupWebSnapshotRuntimeMock.mockRejectedValueOnce('runtime failed');

  dispatchPopupExportRequest({
    ...runtime,
    request: {
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: false,
      requestId: 'req-string-failure',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    },
    sendResponse,
  });

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, warnings: [] })
    );
  });
});
