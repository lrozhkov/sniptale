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

vi.mock('./handlers.full', () => ({
  handleFullCapture: handleFullCaptureMock,
}));

vi.mock('./handlers.visible', () => ({
  handleVisibleCapture: handleVisibleCaptureMock,
  handleVisibleCaptureForCrop: handleVisibleCaptureForCropMock,
}));

vi.mock('./actions.download', () => ({
  handleExecuteSave: vi.fn(),
  handleOpenEditorWithImage: vi.fn(),
  handleReleaseRecordingDownload: vi.fn(),
  handleSaveRecordingForDownload: vi.fn(),
  handleStageRecordingDownloadChunk: vi.fn(),
}));

vi.mock('./actions.export', () => ({
  handleExportCaptureFullPage: vi.fn(),
  handleExportStartHar: vi.fn(),
  handleExportStopHar: vi.fn(),
  handleRequestExportHarStartCapability: vi.fn(),
}));

vi.mock('./actions.gallery-update', () => ({
  handleRequestGalleryImageUpdateCapability: vi.fn(),
  handleSaveScreenshotToGallery: vi.fn(),
  handleUpdateGalleryImageAsset: vi.fn(),
}));

vi.mock('./actions.quick-action', () => ({
  handleTriggerQuickAction: vi.fn(),
}));

vi.mock('./actions.web-snapshot', () => ({
  handleFetchWebSnapshotAsset: vi.fn(),
  handleRegisterWebSnapshotAssets: vi.fn(),
  handleReleaseWebSnapshotStagedBlobs: vi.fn(),
  handleSaveWebSnapshotToGallery: vi.fn(),
  handleStageWebSnapshotBlobChunk: vi.fn(),
}));
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { routeCaptureMessage } from './index';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

function createRouteArgs() {
  return {
    resolvedTabId: 42,
    sendResponse: vi.fn(),
    viewportState: new Map([
      [42, { presetId: 'test:viewport', target: 'viewport' as const, width: 1280, height: 720 }],
    ]),
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
