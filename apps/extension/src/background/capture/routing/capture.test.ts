import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleFullCaptureMock, handleVisibleCaptureMock, handleVisibleCaptureForCropMock } =
  vi.hoisted(() => ({
    handleFullCaptureMock: vi.fn(),
    handleVisibleCaptureMock: vi.fn(),
    handleVisibleCaptureForCropMock: vi.fn(),
  }));
const { ensureActivePageAccessRuntimeMock } = vi.hoisted(() => ({
  ensureActivePageAccessRuntimeMock: vi.fn(),
}));

vi.mock('./handlers', () => ({
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
    OPEN_EDITOR_WITH_IMAGE: 'OPEN_EDITOR_WITH_IMAGE',
    REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY: 'REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY',
    SAVE_SCREENSHOT_TO_GALLERY: 'SAVE_SCREENSHOT_TO_GALLERY',
    STAGE_WEB_SNAPSHOT_BLOB_CHUNK: 'STAGE_WEB_SNAPSHOT_BLOB_CHUNK',
    UPDATE_GALLERY_IMAGE_ASSET: 'UPDATE_GALLERY_IMAGE_ASSET',
  },
  handleFullCapture: handleFullCaptureMock,
  handleVisibleCapture: handleVisibleCaptureMock,
  handleVisibleCaptureForCrop: handleVisibleCaptureForCropMock,
}));

vi.mock('./actions', () => ({
  handleExportCaptureFullPage: vi.fn(),
  handleExportStartHar: vi.fn(),
  handleExportStopHar: vi.fn(),
  handleExecuteSave: vi.fn(),
  handleFetchWebSnapshotAsset: vi.fn(),
  handleOpenEditorWithImage: vi.fn(),
  handleRegisterWebSnapshotAssets: vi.fn(),
  handleRequestGalleryImageUpdateCapability: vi.fn(),
  handleRequestExportHarStartCapability: vi.fn(),
  handleReleaseRecordingDownload: vi.fn(),
  handleSaveRecordingForDownload: vi.fn(),
  handleSaveScreenshotToGallery: vi.fn(),
  handleSaveWebSnapshotToGallery: vi.fn(),
  handleStageRecordingDownloadChunk: vi.fn(),
  handleStageWebSnapshotBlobChunk: vi.fn(),
  handleTriggerQuickAction: vi.fn(),
  handleUpdateGalleryImageAsset: vi.fn(),
}));
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { routeCaptureMessage } from './index';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

function createRouteArgs() {
  return {
    resolvedTabId: 42,
    sendResponse: vi.fn(),
    viewportState: new Map([[42, { width: 1280, height: 720 }]]),
    screenshotModeState: new Map([[42, true]]),
    captureGuardState: { isCapturing: false },
    pageAccessPort: {
      ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
      ensureNativeVisibleCaptureAuthority: vi.fn(),
    },
    scenarioSessionService: createScenarioSessionServiceStub(),
  };
}

function createCaptureContextMessage<
  T extends
    | typeof CaptureMessageType.CAPTURE_VISIBLE
    | typeof CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP
    | typeof CaptureMessageType.CAPTURE_FULL,
>(type: T) {
  return { type, actionType: 'download_default' as const };
}

function resetCaptureContextMocks() {
  vi.clearAllMocks();
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  handleVisibleCaptureMock.mockReturnValue(true);
  handleVisibleCaptureForCropMock.mockReturnValue(true);
  handleFullCaptureMock.mockReturnValue(true);
}

async function flushAsyncRoute() {
  await Promise.resolve();
  await Promise.resolve();
}

async function verifiesCaptureContextRoutes() {
  const args = createRouteArgs();

  expect(
    routeCaptureMessage({
      ...args,
      message: createCaptureContextMessage(CaptureMessageType.CAPTURE_VISIBLE),
    })
  ).toBe(true);
  await flushAsyncRoute();
  expect(handleVisibleCaptureMock).toHaveBeenCalledWith(
    expect.objectContaining({
      message: createCaptureContextMessage(CaptureMessageType.CAPTURE_VISIBLE),
      resolvedTabId: 42,
      viewportState: args.viewportState,
      screenshotModeState: args.screenshotModeState,
      captureGuardState: args.captureGuardState,
    })
  );

  expect(
    routeCaptureMessage({
      ...args,
      message: createCaptureContextMessage(CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP),
    })
  ).toBe(true);
  await flushAsyncRoute();
  expect(handleVisibleCaptureForCropMock).toHaveBeenCalledWith(
    expect.objectContaining({
      message: createCaptureContextMessage(CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP),
    })
  );

  expect(
    routeCaptureMessage({
      ...args,
      message: createCaptureContextMessage(CaptureMessageType.CAPTURE_FULL),
    })
  ).toBe(true);
  await flushAsyncRoute();
  expect(handleFullCaptureMock).toHaveBeenCalledWith(
    expect.objectContaining({
      message: createCaptureContextMessage(CaptureMessageType.CAPTURE_FULL),
    })
  );
}

describe('capture-router capture routes', () => {
  beforeEach(resetCaptureContextMocks);

  it('routes capture requests through handler contexts', verifiesCaptureContextRoutes);
});
