import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureFullPageMock,
  captureFullPageTransactionMock,
  captureViewportWithClipTransactionMock,
  captureVisibleTabForCropTransactionMock,
  executeDownloadMock,
  generateFilenameMock,
  getErrorMessageMock,
  loadSettingsMock,
  loggerLogMock,
  openEditorWithImageMock,
  persistScenarioCaptureFromBackgroundMock,
  saveScreenshotToMediaHubFromDataUrlMock,
  transitionCaptureJobMock,
} = vi.hoisted(() => ({
  captureFullPageMock: vi.fn(),
  captureFullPageTransactionMock: vi.fn(),
  captureViewportWithClipTransactionMock: vi.fn(),
  captureVisibleTabForCropTransactionMock: vi.fn(),
  executeDownloadMock: vi.fn(),
  generateFilenameMock: vi.fn(),
  getErrorMessageMock: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  loadSettingsMock: vi.fn(),
  loggerLogMock: vi.fn(),
  openEditorWithImageMock: vi.fn(),
  persistScenarioCaptureFromBackgroundMock: vi.fn(),
  saveScreenshotToMediaHubFromDataUrlMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: loggerLogMock }),
}));

vi.mock('../../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging/index')>()),
  getErrorMessage: getErrorMessageMock,
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: loadSettingsMock,
}));

vi.mock('@sniptale/foundation/utils/filename', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/filename')>()),
  generateFilename: generateFilenameMock,
}));

vi.mock('../index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../index')>()),
  captureFullPage: captureFullPageMock,
  captureFullPageTransaction: captureFullPageTransactionMock,
  captureViewportWithClipTransaction: captureViewportWithClipTransactionMock,
  captureVisibleTabForCropTransaction: captureVisibleTabForCropTransactionMock,
}));

vi.mock('../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/state-machine')>()),
  transitionCaptureJob: transitionCaptureJobMock,
}));

vi.mock('../download/download-router/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download/download-router/index')>()),
  executeDownload: executeDownloadMock,
}));

vi.mock('../../media-hub/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media-hub/assets')>()),
  saveScreenshotToMediaHubFromDataUrl: saveScreenshotToMediaHubFromDataUrlMock,
}));

vi.mock('../editor/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor/index')>()),
  openEditorWithImage: openEditorWithImageMock,
}));

vi.mock('../application/scenario-capture-persistence', () => ({
  persistScenarioCaptureFromBackground: persistScenarioCaptureFromBackgroundMock,
}));

import {
  type CaptureRouteContext,
  handleFullCapture,
  handleVisibleCapture,
  handleVisibleCaptureForCrop,
} from './handlers';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import { flushCaptureHandlerPromises } from './handlers.test-support';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

function createContext(): CaptureRouteContext {
  const viewportState: Map<number, { width: number; height: number } | null> = new Map([
    [42, { width: 1280, height: 720 }],
  ]);

  return {
    resolvedTabId: 42,
    sendResponse: createSendResponse(),
    viewportState,
    screenshotModeState: new Map([[42, true]]),
    captureGuardState: { isCapturing: false },
    scenarioSessionService: createScenarioSessionServiceStub(),
  };
}

function resetCaptureHandlerMocks() {
  vi.clearAllMocks();
  persistScenarioCaptureFromBackgroundMock.mockResolvedValue(undefined);
  transitionCaptureJobMock.mockResolvedValue(undefined);
}

async function verifiesVisibleCaptureDownloadFlow() {
  const context = createContext();
  loadSettingsMock.mockResolvedValue({
    captureAction: 'download_default',
    imageFormat: 'png',
    saveCapturesToGallery: true,
    defaultImagePresetId: 'preset-1',
  });
  generateFilenameMock.mockReturnValue('visible.png');
  captureViewportWithClipTransactionMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,1',
    jobId: 'capture-job-visible',
  });
  saveScreenshotToMediaHubFromDataUrlMock.mockResolvedValue(undefined);
  executeDownloadMock.mockResolvedValue(undefined);

  expect(handleVisibleCapture(context)).toBe(true);
  await flushCaptureHandlerPromises();
  await flushCaptureHandlerPromises();

  expect(loggerLogMock).toHaveBeenCalledWith('Handling visible capture request', { tabId: 42 });
  expect(captureViewportWithClipTransactionMock).toHaveBeenCalledWith(42, {
    width: 1280,
    height: 720,
  });
  expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
    'data:image/png;base64,1',
    'visible.png',
    42
  );
  expect(persistScenarioCaptureFromBackgroundMock).toHaveBeenCalledWith(
    expect.objectContaining({
      tabId: 42,
    })
  );
  expect(executeDownloadMock).toHaveBeenCalledWith(
    'data:image/png;base64,1',
    'visible.png',
    'download_default',
    'preset-1',
    'capture-job-visible'
  );
  expect(context.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
}

async function verifiesVisibleCaptureCopyAndEditFlows() {
  const copyContext = createContext();
  const editContext = createContext();

  loadSettingsMock
    .mockResolvedValueOnce({
      captureAction: 'copy',
      imageFormat: 'png',
      saveCapturesToGallery: false,
    })
    .mockResolvedValueOnce({
      captureAction: 'ask_system',
      imageFormat: 'jpeg',
      saveCapturesToGallery: false,
    });
  generateFilenameMock.mockReturnValueOnce('copy.png').mockReturnValueOnce('full.jpeg');
  captureViewportWithClipTransactionMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,2',
    jobId: 'capture-job-copy',
  });
  captureFullPageTransactionMock.mockResolvedValue({
    dataUrl: 'data:image/jpeg;base64,3',
    jobId: 'capture-job-full-edit',
  });
  openEditorWithImageMock.mockResolvedValue(undefined);

  expect(handleVisibleCapture(copyContext)).toBe(true);
  expect(
    handleFullCapture({
      ...editContext,
      message: { actionType: 'edit' },
    })
  ).toBe(true);

  await flushCaptureHandlerPromises();
  await flushCaptureHandlerPromises();

  expect(copyContext.sendResponse).toHaveBeenCalledWith({
    success: true,
    dataUrl: 'data:image/png;base64,2',
    action: 'copy',
  });
  expect(openEditorWithImageMock).toHaveBeenCalledWith('data:image/jpeg;base64,3', { tabId: 42 });
  expect(editContext.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
}

async function verifiesScenarioPayloadIsForwardedOnlyForScenarioCaptures() {
  const scenarioContext = createContext();
  scenarioContext.message = {
    actionType: 'scenario',
    scenarioCapture: {
      captureSurface: 'visible',
      sourceKind: 'manual',
      page: {
        title: 'Page',
        url: 'https://example.com',
        viewport: { x: 0, y: 0, width: 1000, height: 800 },
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
      },
    },
  };

  loadSettingsMock.mockResolvedValue({
    captureAction: 'download_default',
    imageFormat: 'png',
    saveCapturesToGallery: false,
  });
  generateFilenameMock.mockReturnValue('visible.png');
  captureViewportWithClipTransactionMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,6',
    jobId: 'capture-job-scenario',
  });

  expect(handleVisibleCapture(scenarioContext)).toBe(true);
  await flushCaptureHandlerPromises();
  await flushCaptureHandlerPromises();

  expect(persistScenarioCaptureFromBackgroundMock).toHaveBeenCalledWith(
    expect.objectContaining({
      scenarioCapture: scenarioContext.message?.scenarioCapture,
    })
  );
  expect(scenarioContext.sendResponse).toHaveBeenCalledWith({
    success: true,
    action: 'scenario',
  });
}

async function verifiesVisibleCaptureForCropBranches() {
  const successContext = createContext();
  successContext.viewportState.set(42, null);
  const failureContext = createContext();
  failureContext.viewportState.set(42, null);

  captureVisibleTabForCropTransactionMock
    .mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,4',
      jobId: 'capture-job-crop',
    })
    .mockRejectedValueOnce(new Error('crop failed'));

  expect(handleVisibleCaptureForCrop(successContext)).toBe(true);
  expect(handleVisibleCaptureForCrop(failureContext)).toBe(true);

  await flushCaptureHandlerPromises();

  expect(captureVisibleTabForCropTransactionMock).toHaveBeenNthCalledWith(1, 42);
  expect(captureVisibleTabForCropTransactionMock).toHaveBeenNthCalledWith(2, 42);
  expect(successContext.sendResponse).toHaveBeenCalledWith({
    success: true,
    dataUrl: 'data:image/png;base64,4',
  });
  expect(failureContext.sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'crop failed',
  });
}

describe('capture-router-handlers', () => {
  beforeEach(resetCaptureHandlerMocks);
  it(
    'handles visible capture with gallery persistence and download execution',
    verifiesVisibleCaptureDownloadFlow
  );
  it('handles visible-copy and full-edit action branches', verifiesVisibleCaptureCopyAndEditFlows);
  it(
    'forwards scenario payloads only for explicit scenario captures',
    verifiesScenarioPayloadIsForwardedOnlyForScenarioCaptures
  );
  it('handles visible-for-crop success and failure', verifiesVisibleCaptureForCropBranches);
});
