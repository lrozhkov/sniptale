import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
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
  handleRequestExportHarStartCapabilityMock,
  handleReleaseRecordingDownloadMock,
  handleSaveRecordingForDownloadMock,
  handleSaveScreenshotToGalleryMock,
  handleStageRecordingDownloadChunkMock,
  handleTriggerQuickActionMock,
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
  handleRequestExportHarStartCapabilityMock: vi.fn(),
  handleReleaseRecordingDownloadMock: vi.fn(),
  handleSaveRecordingForDownloadMock: vi.fn(),
  handleSaveScreenshotToGalleryMock: vi.fn(),
  handleStageRecordingDownloadChunkMock: vi.fn(),
  handleTriggerQuickActionMock: vi.fn(),
  handleVisibleCaptureForCropMock: vi.fn(),
  handleVisibleCaptureMock: vi.fn(),
}));
const { browserTabsGetMock, ensureActivePageAccessRuntimeMock } = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
}));

vi.mock('./handlers.full', () => ({
  handleFullCapture: handleFullCaptureMock,
}));

vi.mock('./handlers.visible', () => ({
  handleVisibleCapture: handleVisibleCaptureMock,
  handleVisibleCaptureForCrop: handleVisibleCaptureForCropMock,
}));

vi.mock('./actions.download', () => ({
  handleExecuteSave: handleExecuteSaveMock,
  handleOpenEditorWithImage: handleOpenEditorWithImageMock,
  handleReleaseRecordingDownload: handleReleaseRecordingDownloadMock,
  handleSaveRecordingForDownload: handleSaveRecordingForDownloadMock,
  handleStageRecordingDownloadChunk: handleStageRecordingDownloadChunkMock,
}));

vi.mock('./actions.export', () => ({
  handleExportCaptureFullPage: handleExportCaptureFullPageMock,
  handleExportStartHar: handleExportStartHarMock,
  handleExportStopHar: handleExportStopHarMock,
  handleRequestExportHarStartCapability: handleRequestExportHarStartCapabilityMock,
}));

vi.mock('./actions.gallery-update', () => ({
  handleSaveScreenshotToGallery: handleSaveScreenshotToGalleryMock,
}));

vi.mock('./actions.quick-action', () => ({
  handleTriggerQuickAction: handleTriggerQuickActionMock,
}));

vi.mock('./actions.web-snapshot', () => ({
  handleFetchWebSnapshotAsset: handleFetchWebSnapshotAssetMock,
  handleRegisterWebSnapshotAssets: handleRegisterWebSnapshotAssetsMock,
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
  mockRoutesAsHandled(handleRegisterWebSnapshotAssetsMock);
  mockRoutesAsHandled(handleSaveRecordingForDownloadMock, handleSaveScreenshotToGalleryMock);
  mockRoutesAsHandled(handleTriggerQuickActionMock);
  mockRoutesAsHandled(handleVisibleCaptureForCropMock, handleVisibleCaptureMock);
});

it('routes registered web snapshot asset fetches to the capture action owner', () => {
  const { routed, sendResponse } = routeMessage({
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    snapshotSessionId: 'snapshot-session-1',
    urls: ['https://assets.example.test/example.svg'],
  });

  expect(routed).toBe(true);
  expect(handleFetchWebSnapshotAssetMock).toHaveBeenCalledWith(
    {
      type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
      snapshotSessionId: 'snapshot-session-1',
      urls: ['https://assets.example.test/example.svg'],
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
    {
      type: MessageType.OPEN_EDITOR_WITH_IMAGE,
      dataUrl: 'data:image/png;base64,1',
    },
    42,
    open.sendResponse,
    undefined
  );
  expect(handleSaveScreenshotToGalleryMock).toHaveBeenCalledWith(
    expect.objectContaining({ filename: 'capture.png' }),
    42,
    saveScreenshot.sendResponse,
    undefined
  );
});

it('routes Web-copy asset registration through the shared helper branch', () => {
  const registerAssets = routeMessage({
    type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
    assetUrls: ['https://cdn.example.com/image.png'],
    requestId: 'req-web',
  });

  expect(registerAssets.routed).toBe(true);
  expect(handleRegisterWebSnapshotAssetsMock).toHaveBeenCalledWith(
    expect.objectContaining({ assetUrls: ['https://cdn.example.com/image.png'] }),
    42,
    registerAssets.sendResponse
  );
});
