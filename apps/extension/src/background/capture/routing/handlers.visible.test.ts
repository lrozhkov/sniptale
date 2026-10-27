const { getQuickActionAppearanceSnapshotMock } = vi.hoisted(() => ({
  getQuickActionAppearanceSnapshotMock: vi.fn(),
}));
vi.mock('../quick-actions/flow/surface', () => ({
  getQuickActionAppearanceSnapshot: getQuickActionAppearanceSnapshotMock,
}));
const { beginPageAppearanceMock } = vi.hoisted(() => ({ beginPageAppearanceMock: vi.fn() }));
vi.mock('../quick-actions/appearance', () => ({ beginPageAppearance: beginPageAppearanceMock }));
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureFullPageMock,
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

vi.mock('../../../workflows/file-naming/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/file-naming/index')>()),
  createScreenshotFilename: generateFilenameMock,
}));

vi.mock('../index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../index')>()),
  captureFullPage: captureFullPageMock,
  captureVisibleTabForCropTransaction: captureVisibleTabForCropTransactionMock,
  captureVisibleTabTransaction: captureVisibleTabForCropTransactionMock,
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
    viewportState: new Map([
      [42, { presetId: 'test:viewport', target: 'window' as const, width: 1280, height: 720 }],
    ]),
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
  getQuickActionAppearanceSnapshotMock.mockReturnValue({ imageFormat: 'webp', imageQuality: 61 });
  beginPageAppearanceMock.mockReturnValue({ assertCurrent() {}, release() {} });
  loadSettingsMock.mockResolvedValue({
    captureAction: 'download_default',
    imageFormat: 'png',
    saveCapturesToGallery: true,
    defaultImagePresetId: 'preset-1',
  });
  generateFilenameMock.mockReturnValue('visible.png');
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
  it('handles visible capture with temporary persistence and download execution', async () => {
    const context = createContext();

    expect(handleVisibleCapture(context)).toBe(true);
    await flushPromises();
    await flushPromises();

    expect(generateFilenameMock).toHaveBeenCalledWith(
      'visible',
      'png',
      expect.objectContaining({ imageFormat: 'png' })
    );
    expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
      'data:image/png;base64,2',
      'visible.png',
      42,
      'temporary'
    );
    expect(persistScenarioCaptureFromBackgroundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        galleryAssetId: 'asset-1',
      })
    );
    expect(executeDownloadMock).toHaveBeenCalledWith(
      'data:image/png;base64,2',
      'visible.png',
      'download_default',
      'preset-1',
      'capture-job-crop'
    );
    expect(context.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  });

  it('marks the capture job failed when post-render persistence rejects', async () => {
    const context = createContext();
    saveScreenshotToMediaHubFromDataUrlMock.mockRejectedValueOnce(new Error('gallery failed'));

    expect(handleVisibleCapture(context)).toBe(true);
    await flushPromises();
    await flushPromises();

    expect(transitionCaptureJobMock).toHaveBeenCalledWith('capture-job-crop', 'failed', {
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

it('captures a lossless viewport before quick action appearance encoding', async () => {
  beginPageAppearanceMock.mockReturnValue({
    prepare: async (dataUrl: string, filename: string) => ({ dataUrl, filename }),
    assertCurrent() {},
    release() {},
  });
  const context = createContext();
  handleVisibleCapture(context);
  await vi.waitFor(() => expect(captureVisibleTabForCropTransactionMock).toHaveBeenCalled());
  expect(captureVisibleTabForCropTransactionMock).toHaveBeenCalledWith(42, {
    losslessSource: true,
  });
});

it('selects lossless appearance output for an explicit visible clipboard action', async () => {
  beginPageAppearanceMock.mockReturnValue({
    prepare: async (dataUrl: string, filename: string) => ({ dataUrl, filename }),
    assertCurrent() {},
    release() {},
  });
  const context = createContext();
  context.message = { actionType: 'copy', quickActionTransactionId: 'clipboard-appearance' };
  handleVisibleCapture(context);
  await vi.waitFor(() => expect(context.sendResponse).toHaveBeenCalled());
  expect(beginPageAppearanceMock).toHaveBeenCalledWith(42, 'clipboard-appearance', 'png', false);
});

it.each(['jpeg', 'webp'] as const)(
  'uses an unstyled quick action %s format and quality for native capture and filename',
  async (imageFormat) => {
    getQuickActionAppearanceSnapshotMock.mockReturnValue({ imageFormat, imageQuality: 61 });
    loadSettingsMock.mockResolvedValue({
      captureAction: 'download_default',
      imageFormat: 'png',
      imageQuality: 90,
    });
    generateFilenameMock.mockImplementation(
      (_mode: string, format: string) => `visible.${format === 'jpeg' ? 'jpg' : format}`
    );
    captureVisibleTabForCropTransactionMock.mockResolvedValue({
      dataUrl: `data:image/${imageFormat};base64,captured`,
      jobId: 'profile-job',
    });
    const context = createContext();
    context.message = { actionType: 'download_default', quickActionTransactionId: 'profile' };
    handleVisibleCapture(context);
    await vi.waitFor(() => expect(context.sendResponse).toHaveBeenCalled());
    expect(captureVisibleTabForCropTransactionMock).toHaveBeenCalledWith(42, {
      losslessSource: false,
      format: imageFormat,
      quality: 61,
    });
    expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
      `data:image/${imageFormat};base64,captured`,
      `visible.${imageFormat === 'jpeg' ? 'jpg' : imageFormat}`,
      42,
      'temporary'
    );
  }
);
