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
  handleRequestGalleryImageUpdateCapabilityMock,
  handleRequestExportHarStartCapabilityMock,
  handleReleaseRecordingDownloadMock,
  handleSaveRecordingForDownloadMock,
  handleSaveScreenshotToGalleryMock,
  handleSaveWebSnapshotToGalleryMock,
  handleStageRecordingDownloadChunkMock,
  handleStageWebSnapshotBlobChunkMock,
  handleTriggerQuickActionMock,
  handleUpdateGalleryImageAssetMock,
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
  handleRequestGalleryImageUpdateCapabilityMock: vi.fn(),
  handleRequestExportHarStartCapabilityMock: vi.fn(),
  handleReleaseRecordingDownloadMock: vi.fn(),
  handleSaveRecordingForDownloadMock: vi.fn(),
  handleSaveScreenshotToGalleryMock: vi.fn(),
  handleSaveWebSnapshotToGalleryMock: vi.fn(),
  handleStageRecordingDownloadChunkMock: vi.fn(),
  handleStageWebSnapshotBlobChunkMock: vi.fn(),
  handleTriggerQuickActionMock: vi.fn(),
  handleUpdateGalleryImageAssetMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: (...args: unknown[]) => browserTabsGetMock(...args),
  },
}));

vi.mock('../handlers', () => ({
  CaptureRouteContext: undefined,
  CaptureMessageType: {
    CAPTURE_VISIBLE: 'CAPTURE_VISIBLE',
    CAPTURE_VISIBLE_FOR_CROP: 'CAPTURE_VISIBLE_FOR_CROP',
    CAPTURE_FULL: 'CAPTURE_FULL',
  },
  MessageType: {
    EXECUTE_SAVE: 'EXECUTE_SAVE',
    EXPORT_START_HAR: 'EXPORT_START_HAR',
    EXPORT_STOP_HAR: 'EXPORT_STOP_HAR',
    EXPORT_CAPTURE_FULL_PAGE: 'EXPORT_CAPTURE_FULL_PAGE',
    FETCH_WEB_SNAPSHOT_ASSET: 'FETCH_WEB_SNAPSHOT_ASSET',
    OPEN_EDITOR_WITH_IMAGE: 'OPEN_EDITOR_WITH_IMAGE',
    REGISTER_WEB_SNAPSHOT_ASSETS: 'REGISTER_WEB_SNAPSHOT_ASSETS',
    SAVE_SCREENSHOT_TO_GALLERY: 'SAVE_SCREENSHOT_TO_GALLERY',
    SAVE_WEB_SNAPSHOT_TO_GALLERY: 'SAVE_WEB_SNAPSHOT_TO_GALLERY',
    STAGE_WEB_SNAPSHOT_BLOB_CHUNK: 'STAGE_WEB_SNAPSHOT_BLOB_CHUNK',
    REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY: 'REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY',
    UPDATE_GALLERY_IMAGE_ASSET: 'UPDATE_GALLERY_IMAGE_ASSET',
  },
  handleFullCapture: handleFullCaptureMock,
  handleVisibleCapture: handleVisibleCaptureMock,
  handleVisibleCaptureForCrop: handleVisibleCaptureForCropMock,
}));

vi.mock('../actions', () => ({
  handleExportCaptureFullPage: handleExportCaptureFullPageMock,
  handleExportStartHar: handleExportStartHarMock,
  handleExportStopHar: handleExportStopHarMock,
  handleExecuteSave: handleExecuteSaveMock,
  handleFetchWebSnapshotAsset: handleFetchWebSnapshotAssetMock,
  handleOpenEditorWithImage: handleOpenEditorWithImageMock,
  handleRegisterWebSnapshotAssets: handleRegisterWebSnapshotAssetsMock,
  handleRequestGalleryImageUpdateCapability: handleRequestGalleryImageUpdateCapabilityMock,
  handleRequestExportHarStartCapability: handleRequestExportHarStartCapabilityMock,
  handleReleaseRecordingDownload: handleReleaseRecordingDownloadMock,
  handleSaveRecordingForDownload: handleSaveRecordingForDownloadMock,
  handleSaveScreenshotToGallery: handleSaveScreenshotToGalleryMock,
  handleSaveWebSnapshotToGallery: handleSaveWebSnapshotToGalleryMock,
  handleStageRecordingDownloadChunk: handleStageRecordingDownloadChunkMock,
  handleStageWebSnapshotBlobChunk: handleStageWebSnapshotBlobChunkMock,
  handleTriggerQuickAction: handleTriggerQuickActionMock,
  handleUpdateGalleryImageAsset: handleUpdateGalleryImageAssetMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createScenarioSessionServiceStub } from '../../../../../../../tooling/test/support/scenario-session-service.stub';
import { routeCaptureMessage } from './dispatcher';
import { createWebSnapshotManifest, flushRouteAsync } from './dispatcher.test-support';
import type { RouteCaptureMessage } from '../types';

function createRouteArgs() {
  return {
    resolvedTabId: 42,
    sendResponse: vi.fn(),
    viewportState: new Map<number, { width: number; height: number } | null>([
      [42, { width: 1280, height: 720 }],
    ]),
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
  handleRequestGalleryImageUpdateCapabilityMock.mockReturnValue(true);
  handleSaveScreenshotToGalleryMock.mockReturnValue(true);
  handleSaveWebSnapshotToGalleryMock.mockReturnValue(true);
  handleStageWebSnapshotBlobChunkMock.mockReturnValue(true);
  handleUpdateGalleryImageAssetMock.mockReturnValue(true);
  handleTriggerQuickActionMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({ id: 42, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
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
  [{ type: MessageType.EXPORT_CAPTURE_FULL_PAGE }, handleExportCaptureFullPageMock],
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
      type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
      snapshotSessionId: 'snapshot-session-1',
      url: 'https://example.test/a.png',
    },
    handleFetchWebSnapshotAssetMock,
  ],
  [
    {
      type: MessageType.UPDATE_GALLERY_IMAGE_ASSET,
      assetId: 'asset-1',
      dataUrl: 'data:image/png;base64,1',
      editorSessionId: 'session-1',
      updateCapabilityToken: 'token-1',
    },
    handleUpdateGalleryImageAssetMock,
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
