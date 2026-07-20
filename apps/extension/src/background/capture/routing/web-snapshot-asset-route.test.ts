import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { routeCaptureMessage } from './index';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

const {
  handleExecuteSaveMock,
  handleExportCaptureFullPageMock,
  handleExportStartHarMock,
  handleExportStopHarMock,
  handleFetchWebSnapshotAssetMock,
  handleFullCaptureMock,
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
  handleVisibleCaptureForCropMock,
  handleVisibleCaptureMock,
} = vi.hoisted(() => ({
  handleExecuteSaveMock: vi.fn(),
  handleExportCaptureFullPageMock: vi.fn(),
  handleExportStartHarMock: vi.fn(),
  handleExportStopHarMock: vi.fn(),
  handleFetchWebSnapshotAssetMock: vi.fn(),
  handleFullCaptureMock: vi.fn(),
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
  handleVisibleCaptureForCropMock: vi.fn(),
  handleVisibleCaptureMock: vi.fn(),
}));
const { browserTabsGetMock, ensureActivePageAccessRuntimeMock } = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
}));

vi.mock('./handlers', () => ({
  CaptureRouteContext: undefined,
  handleFullCapture: handleFullCaptureMock,
  handleVisibleCapture: handleVisibleCaptureMock,
  handleVisibleCaptureForCrop: handleVisibleCaptureForCropMock,
}));

vi.mock('./actions', () => ({
  handleExecuteSave: handleExecuteSaveMock,
  handleExportCaptureFullPage: handleExportCaptureFullPageMock,
  handleExportStartHar: handleExportStartHarMock,
  handleExportStopHar: handleExportStopHarMock,
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
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGetMock },
}));
function routeMessage(
  message: Parameters<typeof routeCaptureMessage>[0]['message'],
  sender?: chrome.runtime.MessageSender | undefined
) {
  const sendResponse = vi.fn();
  const routed = routeCaptureMessage({
    captureGuardState: { isCapturing: false },
    message,
    resolvedTabId: 42,
    scenarioSessionService: createScenarioSessionServiceStub(),
    sender,
    screenshotModeState: new Map(),
    sendResponse,
    viewportState: new Map(),
    pageAccessPort: {
      ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
      ensureNativeVisibleCaptureAuthority: vi.fn(),
    },
  });

  return { routed, sendResponse };
}

function createWebSnapshotManifest(): WebSnapshotManifest {
  return {
    captureMode: 'readOnlyNoScripts',
    capturedAt: '2026-06-08T00:00:00.000Z',
    id: 'snapshot-session-1',
    paths: {
      computedStyles: 'logs/css/computed-styles.json',
      domSnapshot: 'logs/dom.html',
      errors: 'logs/errors.log',
      manifest: 'manifest.json',
      screenshot: 'page-screenshot.png',
      snapshotHtml: 'snapshot/index.html',
      stylesheets: 'logs/css/stylesheets.json',
      virtualDomSnapshot: 'logs/virtual-dom.html',
    },
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Example', url: 'https://example.test' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 1 },
    warnings: [],
  };
}

function mockRoutesAsHandled(...mocks: Array<ReturnType<typeof vi.fn>>) {
  mocks.forEach((mock) => mock.mockReturnValue(true));
}

beforeEach(() => {
  vi.clearAllMocks();
  browserTabsGetMock.mockResolvedValue({
    id: 42,
    url: 'chrome-extension://test/apps/extension/src/web-snapshot-viewer/index.html?snapshotId=s1',
  });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  mockRoutesAsHandled(handleExecuteSaveMock, handleFullCaptureMock);
  mockRoutesAsHandled(
    handleExportCaptureFullPageMock,
    handleExportStartHarMock,
    handleExportStopHarMock
  );
  mockRoutesAsHandled(handleFetchWebSnapshotAssetMock, handleOpenEditorWithImageMock);
  mockRoutesAsHandled(
    handleRegisterWebSnapshotAssetsMock,
    handleRequestGalleryImageUpdateCapabilityMock
  );
  mockRoutesAsHandled(handleSaveRecordingForDownloadMock, handleSaveScreenshotToGalleryMock);
  mockRoutesAsHandled(handleSaveWebSnapshotToGalleryMock, handleStageWebSnapshotBlobChunkMock);
  mockRoutesAsHandled(handleTriggerQuickActionMock, handleUpdateGalleryImageAssetMock);
  mockRoutesAsHandled(handleVisibleCaptureForCropMock, handleVisibleCaptureMock);
});

it('routes registered web snapshot asset fetches to the capture action owner', () => {
  const { routed, sendResponse } = routeMessage({
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    snapshotSessionId: 'snapshot-session-1',
    url: 'https://upload.wikimedia.org/example.svg',
  });

  expect(routed).toBe(true);
  expect(handleFetchWebSnapshotAssetMock).toHaveBeenCalledWith(
    {
      type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
      snapshotSessionId: 'snapshot-session-1',
      url: 'https://upload.wikimedia.org/example.svg',
    },
    42,
    sendResponse
  );
});

it('routes editor and screenshot gallery messages through the shared helper branch', () => {
  const open = routeMessage({
    type: MessageType.OPEN_EDITOR_WITH_IMAGE,
    dataUrl: 'data:image/png;base64,1',
  });
  const saveScreenshot = routeMessage({
    type: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
    dataUrl: 'data:image/png;base64,2',
    filename: 'capture.png',
  });

  expect(open.routed).toBe(true);
  expect(saveScreenshot.routed).toBe(true);
  expect(handleOpenEditorWithImageMock).toHaveBeenCalledWith(
    'data:image/png;base64,1',
    42,
    open.sendResponse
  );
  expect(handleSaveScreenshotToGalleryMock).toHaveBeenCalledWith(
    expect.objectContaining({ filename: 'capture.png' }),
    42,
    saveScreenshot.sendResponse
  );
});

it('routes web snapshot messages through the shared helper branch', () => {
  const saveSnapshot = routeMessage({
    type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
    manifest: createWebSnapshotManifest(),
    packageStagedBlobId: 'package-stage-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'screenshot-stage-1',
    snapshotSessionId: 'snapshot-session-1',
  });
  const registerAssets = routeMessage({
    type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    assetUrls: ['https://cdn.example.com/image.png'],
    requestId: 'req-web',
  });

  expect(saveSnapshot.routed).toBe(true);
  expect(registerAssets.routed).toBe(true);
  expect(handleSaveWebSnapshotToGalleryMock).toHaveBeenCalledWith(
    expect.objectContaining({ packageStagedBlobId: 'package-stage-1' }),
    42,
    saveSnapshot.sendResponse
  );
  expect(handleRegisterWebSnapshotAssetsMock).toHaveBeenCalledWith(
    expect.objectContaining({ assetUrls: ['https://cdn.example.com/image.png'] }),
    42,
    registerAssets.sendResponse
  );
});

it('routes gallery update capability messages with the editor sender', () => {
  const sender = {
    documentId: 'document-1',
    url: 'chrome-extension://test/apps/extension/src/editor/index.html?assetId=asset-1&session=session-1',
  };
  const capabilityRequest = routeMessage(
    {
      type: MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY,
      assetId: 'asset-1',
      editorSessionId: 'session-1',
    },
    sender
  );
  const update = routeMessage(
    {
      type: MessageType.UPDATE_GALLERY_IMAGE_ASSET,
      assetId: 'asset-1',
      dataUrl: 'data:image/png;base64,3',
      editorSessionId: 'session-1',
      updateCapabilityToken: 'token-1',
    },
    sender
  );

  expect(capabilityRequest.routed).toBe(true);
  expect(update.routed).toBe(true);
  expect(handleRequestGalleryImageUpdateCapabilityMock).toHaveBeenCalledWith(
    expect.objectContaining({ assetId: 'asset-1' }),
    sender,
    capabilityRequest.sendResponse
  );
  expect(handleUpdateGalleryImageAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({ assetId: 'asset-1' }),
    sender,
    update.sendResponse
  );
});
