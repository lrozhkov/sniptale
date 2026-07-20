import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureFullPageMock,
  captureViewportWithClipTransactionMock,
  captureVisibleTabForCropTransactionMock,
  executeDownloadMock,
  generateFilenameMock,
  loadSettingsMock,
  openEditorWithImageMock,
  persistScenarioCaptureFromBackgroundMock,
  saveScreenshotToMediaHubFromDataUrlMock,
  transitionCaptureJobMock,
} = vi.hoisted(() => ({
  captureFullPageMock: vi.fn(),
  captureViewportWithClipTransactionMock: vi.fn(),
  captureVisibleTabForCropTransactionMock: vi.fn(),
  executeDownloadMock: vi.fn(),
  generateFilenameMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  openEditorWithImageMock: vi.fn(),
  persistScenarioCaptureFromBackgroundMock: vi.fn(),
  saveScreenshotToMediaHubFromDataUrlMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    log: vi.fn(),
  }),
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

vi.mock('../editor/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor/index')>()),
  openEditorWithImage: openEditorWithImageMock,
}));

vi.mock('../application/scenario-capture-persistence', () => ({
  persistScenarioCaptureFromBackground: persistScenarioCaptureFromBackgroundMock,
}));

vi.mock('../../media-hub/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media-hub/assets')>()),
  saveScreenshotToMediaHubFromDataUrl: saveScreenshotToMediaHubFromDataUrlMock,
}));

import { handleVisibleCapture, handleVisibleCaptureForCrop } from './handlers.visible';
import type { CaptureRouteContext } from './types';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

function createContext(): CaptureRouteContext {
  return {
    resolvedTabId: 42,
    sendResponse: createSendResponse(),
    viewportState: new Map([[42, { width: 1280, height: 720 }]]),
    screenshotModeState: new Map([[42, true]]),
    captureGuardState: { isCapturing: false },
    scenarioSessionService: createScenarioSessionServiceStub(),
  };
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSettingsMock.mockResolvedValue({
    captureAction: 'download_default',
    imageFormat: 'png',
    saveCapturesToGallery: true,
    defaultImagePresetId: 'preset-1',
  });
  generateFilenameMock.mockReturnValue('visible.png');
  captureViewportWithClipTransactionMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,1',
    jobId: 'capture-job-viewport',
  });
  captureVisibleTabForCropTransactionMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,2',
    jobId: 'capture-job-crop',
  });
  captureFullPageMock.mockResolvedValue('data:image/png;base64,3');
  saveScreenshotToMediaHubFromDataUrlMock.mockResolvedValue('asset-1');
  executeDownloadMock.mockResolvedValue(undefined);
  openEditorWithImageMock.mockResolvedValue(undefined);
  persistScenarioCaptureFromBackgroundMock.mockResolvedValue(undefined);
  transitionCaptureJobMock.mockResolvedValue(undefined);
});

describe('capture-router-handlers.visible', () => {
  it('handles visible capture with gallery persistence and download execution', async () => {
    const context = createContext();

    expect(handleVisibleCapture(context)).toBe(true);
    await flushPromises();
    await flushPromises();

    expect(generateFilenameMock).toHaveBeenCalledWith('visible', 'png');
    expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
      'data:image/png;base64,1',
      'visible.png',
      42
    );
    expect(persistScenarioCaptureFromBackgroundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        galleryAssetId: 'asset-1',
      })
    );
    expect(executeDownloadMock).toHaveBeenCalledWith(
      'data:image/png;base64,1',
      'visible.png',
      'download_default',
      'preset-1',
      'capture-job-viewport'
    );
    expect(context.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  });

  it('marks the capture job failed when post-render persistence rejects', async () => {
    const context = createContext();
    saveScreenshotToMediaHubFromDataUrlMock.mockRejectedValueOnce(new Error('gallery failed'));

    expect(handleVisibleCapture(context)).toBe(true);
    await flushPromises();
    await flushPromises();

    expect(transitionCaptureJobMock).toHaveBeenCalledWith('capture-job-viewport', 'failed', {
      error: 'gallery failed',
    });
    expect(context.sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'gallery failed',
    });
  });
});

describe('capture-router-handlers.visible crop', () => {
  it('handles visible-for-crop success without persistence', async () => {
    const context = createContext();
    context.viewportState.set(42, null);

    expect(handleVisibleCaptureForCrop(context)).toBe(true);
    await flushPromises();

    expect(captureVisibleTabForCropTransactionMock).toHaveBeenCalledWith(42);
    expect(loadSettingsMock).not.toHaveBeenCalled();
    expect(transitionCaptureJobMock).toHaveBeenCalledWith('capture-job-crop', 'completed');
    expect(context.sendResponse).toHaveBeenCalledWith({
      success: true,
      dataUrl: 'data:image/png;base64,2',
    });
  });

  it('handles legacy crop payloads without capture job transition', async () => {
    const context = createContext();
    context.viewportState.set(42, null);
    captureVisibleTabForCropTransactionMock.mockResolvedValueOnce('data:image/png;base64,legacy');

    expect(handleVisibleCaptureForCrop(context)).toBe(true);
    await flushPromises();

    expect(transitionCaptureJobMock).not.toHaveBeenCalled();
    expect(context.sendResponse).toHaveBeenCalledWith({
      success: true,
      dataUrl: 'data:image/png;base64,legacy',
    });
  });
});
