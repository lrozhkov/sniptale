import { beforeEach, expect, it, vi, type Mock } from 'vitest';

const {
  handleFullCaptureMock,
  handleVisibleCaptureMock,
  handleVisibleCaptureForCropMock,
  handleExportCaptureFullPageMock,
  handleExportStartHarMock,
  handleExportStopHarMock,
  handleExecuteSaveMock,
  handleFetchWebSnapshotAssetMock,
  handleOpenEditorWithImageMock,
  handleRegisterWebSnapshotAssetsMock,
  handleReleaseWebSnapshotStagedBlobsMock,
  handleRequestExportHarStartCapabilityMock,
  handleSaveScreenshotToGalleryMock,
  handleSaveWebSnapshotToGalleryMock,
  handleStageWebSnapshotBlobChunkMock,
  handleTriggerQuickActionMock,
  browserTabsGetMock,
  ensureActivePageAccessRuntimeMock,
} = vi.hoisted(() => ({
  handleFullCaptureMock: vi.fn(),
  handleVisibleCaptureMock: vi.fn(),
  handleVisibleCaptureForCropMock: vi.fn(),
  handleExportCaptureFullPageMock: vi.fn(),
  handleExportStartHarMock: vi.fn(),
  handleExportStopHarMock: vi.fn(),
  handleExecuteSaveMock: vi.fn(),
  handleFetchWebSnapshotAssetMock: vi.fn(),
  handleOpenEditorWithImageMock: vi.fn(),
  handleRegisterWebSnapshotAssetsMock: vi.fn(),
  handleReleaseWebSnapshotStagedBlobsMock: vi.fn(),
  handleRequestExportHarStartCapabilityMock: vi.fn(),
  handleSaveScreenshotToGalleryMock: vi.fn(),
  handleSaveWebSnapshotToGalleryMock: vi.fn(),
  handleStageWebSnapshotBlobChunkMock: vi.fn(),
  handleTriggerQuickActionMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: (...args: unknown[]) => browserTabsGetMock(...args),
  },
}));

vi.mock('../handlers.full', () => ({
  handleFullCapture: handleFullCaptureMock,
}));

vi.mock('../handlers.visible', () => ({
  handleVisibleCapture: handleVisibleCaptureMock,
  handleVisibleCaptureForCrop: handleVisibleCaptureForCropMock,
}));

vi.mock('../actions.download', () => ({
  handleExecuteSave: handleExecuteSaveMock,
  handleOpenEditorWithImage: handleOpenEditorWithImageMock,
}));

vi.mock('../actions.export', () => ({
  handleExportCaptureFullPage: handleExportCaptureFullPageMock,
  handleExportStartHar: handleExportStartHarMock,
  handleExportStopHar: handleExportStopHarMock,
  handleRequestExportHarStartCapability: handleRequestExportHarStartCapabilityMock,
}));

vi.mock('../actions.gallery-update', () => ({
  handleSaveScreenshotToGallery: handleSaveScreenshotToGalleryMock,
}));

vi.mock('../actions.quick-action', () => ({
  handleTriggerQuickAction: handleTriggerQuickActionMock,
}));

vi.mock('../actions.web-snapshot', () => ({
  handleFetchWebSnapshotAsset: handleFetchWebSnapshotAssetMock,
  handleRegisterWebSnapshotAssets: handleRegisterWebSnapshotAssetsMock,
  handleReleaseWebSnapshotStagedBlobs: handleReleaseWebSnapshotStagedBlobsMock,
  handleSaveWebSnapshotToGallery: handleSaveWebSnapshotToGalleryMock,
  handleStageWebSnapshotBlobChunk: handleStageWebSnapshotBlobChunkMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createScenarioSessionServiceStub } from '../../../../../../../tooling/test/support/scenario-session-service.stub';
import { routeCaptureMessage } from './dispatcher';
import { createWebSnapshotManifest, flushRouteAsync } from './dispatcher.test-support';
import type { RouteCaptureMessage } from '../types';
import { markPreauthorizedContentActionRouteMessage } from '../authorization/content-action';
import {
  getScreenshotSurfaceSession,
  resetScreenshotSurfaceSessionsForTests,
} from '../../../capture-surface/screenshot-session';

function createRouteArgs() {
  return {
    resolvedTabId: 42,
    sendResponse: vi.fn(),
    viewportState: new Map<
      number,
      { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
    >([[42, { presetId: 'test:viewport', target: 'viewport' as const, width: 1280, height: 720 }]]),
    screenshotModeState: new Map([[42, true]]),
    captureGuardState: { isCapturing: false },
    pageAccessPort: {
      ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
      ensureNativeVisibleCaptureAuthority: vi.fn(),
    },
    scenarioSessionService: createScenarioSessionServiceStub(),
    webSnapshotViewerPorts: new Map(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetScreenshotSurfaceSessionsForTests();
  handleVisibleCaptureMock.mockReturnValue(true);
  handleVisibleCaptureForCropMock.mockReturnValue(true);
  handleFullCaptureMock.mockReturnValue(true);
  handleExecuteSaveMock.mockReturnValue(true);
  handleExportStartHarMock.mockReturnValue(true);
  handleExportStopHarMock.mockReturnValue(true);
  handleExportCaptureFullPageMock.mockReturnValue(true);
  handleFetchWebSnapshotAssetMock.mockReturnValue(true);
  handleOpenEditorWithImageMock.mockReturnValue(true);
  handleRegisterWebSnapshotAssetsMock.mockReturnValue(true);
  handleReleaseWebSnapshotStagedBlobsMock.mockReturnValue(true);
  handleSaveScreenshotToGalleryMock.mockReturnValue(true);
  handleSaveWebSnapshotToGalleryMock.mockReturnValue(true);
  handleStageWebSnapshotBlobChunkMock.mockReturnValue(true);
  handleTriggerQuickActionMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({ id: 42, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
});

it('renews a screenshot surface only for its preauthorized content document', async () => {
  const args = createRouteArgs();
  const message = {
    contentIntent: { requestId: 'renew-request-1', token: 'renew-token-1' },
    type: CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION,
  } as const;
  markPreauthorizedContentActionRouteMessage(message, {
    documentId: 'content-document-42',
    frameId: 0,
    senderUrl: 'https://example.test/page',
    tabId: 42,
  });

  expect(routeCaptureMessage({ ...args, message })).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(getScreenshotSurfaceSession(42)).toMatchObject({
    documentId: 'content-document-42',
    lastOperationGeneration: 0,
  });
  expect(args.sendResponse).toHaveBeenCalledWith({
    success: true,
    surfaceCapabilityToken: expect.any(String),
    surfaceOperationGeneration: 0,
  });
});

it('rejects screenshot surface renewal without preauthorized sender ownership', async () => {
  const args = createRouteArgs();
  const message = {
    contentIntent: { requestId: 'renew-request-1', token: 'renew-token-1' },
    type: CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION,
  } as const;

  expect(routeCaptureMessage({ ...args, message })).toBe(true);
  await flushRouteAsync();

  expect(args.sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized screenshot surface renewal',
  });
  expect(getScreenshotSurfaceSession(42)).toBeNull();
});

it('routes capture requests through handler contexts', async () => {
  const args = createRouteArgs();

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: CaptureMessageType.CAPTURE_VISIBLE, actionType: 'download_default' },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(handleVisibleCaptureMock).toHaveBeenCalledWith(
    expect.objectContaining({
      resolvedTabId: 42,
      viewportState: args.viewportState,
      screenshotModeState: args.screenshotModeState,
      captureGuardState: args.captureGuardState,
    })
  );
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);

  expect(
    routeCaptureMessage({
      ...args,
      message: {
        type: MessageType.EXECUTE_SAVE,
        dataUrl: 'data:image/png;base64,1',
        filename: 'capture.png',
        actionType: 'download_default',
      },
    })
  ).toBe(true);
  expect(handleExecuteSaveMock).toHaveBeenCalledWith(
    {
      type: MessageType.EXECUTE_SAVE,
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
      actionType: 'download_default',
    },
    42,
    args.sendResponse
  );
});

const routeCases: Array<[RouteCaptureMessage, Mock]> = [
  [{ type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP }, handleVisibleCaptureForCropMock],
  [{ type: CaptureMessageType.CAPTURE_FULL }, handleFullCaptureMock],
  [{ type: MessageType.EXPORT_START_HAR }, handleExportStartHarMock],
  [{ type: MessageType.EXPORT_STOP_HAR }, handleExportStopHarMock],
  [
    { exportRunId: 'export-run-1', type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
    handleExportCaptureFullPageMock,
  ],
  [
    { type: MessageType.OPEN_EDITOR_WITH_IMAGE, dataUrl: 'data:image/png;base64,1' },
    handleOpenEditorWithImageMock,
  ],
  [
    {
      type: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
      dataUrl: 'data:image/png;base64,1',
      filename: 'capture.png',
    },
    handleSaveScreenshotToGalleryMock,
  ],
  [
    {
      type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
      manifest: createWebSnapshotManifest(),
      packageStagedBlobId: 'package-stage-1',
      screenshotMimeType: 'image/png',
      screenshotStagedBlobId: 'screenshot-stage-1',
      snapshotSessionId: 'snapshot-session-1',
    },
    handleSaveWebSnapshotToGalleryMock,
  ],
  [
    {
      type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
      base64: 'emlw',
      blobKind: 'package',
      chunkIndex: 0,
      snapshotSessionId: 'snapshot-session-1',
      stagedBlobId: 'stage-package-1',
      totalBytes: 3,
      totalChunks: 1,
    },
    handleStageWebSnapshotBlobChunkMock,
  ],
  [
    {
      type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
      assetUrls: ['https://example.test/a.png'],
      requestId: 'req-web',
    },
    handleRegisterWebSnapshotAssetsMock,
  ],
  [
    {
      type: MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS,
      snapshotSessionId: 'snapshot-session-1',
    },
    handleReleaseWebSnapshotStagedBlobsMock,
  ],
  [
    {
      type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
      snapshotSessionId: 'snapshot-session-1',
      url: 'https://example.test/a.png',
    },
    handleFetchWebSnapshotAssetMock,
  ],
];

it.each(routeCases)('routes %s through its handler', async (message, handler) => {
  const args = createRouteArgs();

  expect(routeCaptureMessage({ ...args, message })).toBe(true);
  await flushRouteAsync();

  expect(handler).toHaveBeenCalled();
});

it('passes owned snapshot viewer ports through quick-action routing context', async () => {
  const args = createRouteArgs();
  expect(
    routeCaptureMessage({
      ...args,
      message: { type: 'TRIGGER_QUICK_ACTION', actionId: 'viewer-action' },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(handleTriggerQuickActionMock).toHaveBeenCalledWith(
    { type: 'TRIGGER_QUICK_ACTION', actionId: 'viewer-action' },
    expect.objectContaining({ webSnapshotViewerPorts: args.webSnapshotViewerPorts })
  );
  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
});
