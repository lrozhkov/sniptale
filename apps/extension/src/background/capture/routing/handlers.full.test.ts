import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  captureFullPageTransactionMock,
  executeDownloadMock,
  generateFilenameMock,
  loadSettingsMock,
  openEditorWithImageMock,
  persistScenarioCaptureFromBackgroundMock,
  saveScreenshotToMediaHubFromDataUrlMock,
  sendTabMessageMock,
  transitionCaptureJobMock,
  getPreauthorizedContentActionRouteMessageMock,
} = vi.hoisted(() => ({
  captureFullPageTransactionMock: vi.fn(),
  executeDownloadMock: vi.fn(),
  generateFilenameMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  openEditorWithImageMock: vi.fn(),
  persistScenarioCaptureFromBackgroundMock: vi.fn(),
  saveScreenshotToMediaHubFromDataUrlMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
  getPreauthorizedContentActionRouteMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
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
  captureFullPageTransaction: captureFullPageTransactionMock,
}));

vi.mock('./authorization/content-action', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./authorization/content-action')>()),
  getPreauthorizedContentActionRouteMessage: getPreauthorizedContentActionRouteMessageMock,
}));

vi.mock('../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendTabMessage: sendTabMessageMock }),
}));

vi.mock('../download/download-router/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download/download-router/index')>()),
  executeDownload: executeDownloadMock,
}));

vi.mock('../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/state-machine')>()),
  transitionCaptureJob: transitionCaptureJobMock,
}));

vi.mock('../editor/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor/index')>()),
  openEditorWithImage: openEditorWithImageMock,
}));

vi.mock('./scenario/index', () => ({
  persistScenarioCaptureFromBackground: persistScenarioCaptureFromBackgroundMock,
}));

vi.mock('../../media-hub/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media-hub/assets')>()),
  saveScreenshotToMediaHubFromDataUrl: saveScreenshotToMediaHubFromDataUrlMock,
}));

import { handleFullCapture } from './handlers.full';
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
  loadSettingsMock.mockResolvedValue({
    captureAction: 'ask_system',
    imageFormat: 'jpeg',
    saveCapturesToGallery: false,
  });
  generateFilenameMock.mockReturnValue('full.jpeg');
  captureFullPageTransactionMock.mockResolvedValue({
    dataUrl: 'data:image/jpeg;base64,3',
    jobId: 'capture-job-full',
    metadata: { downscaled: false, frozenExtentWarning: false },
  });
  openEditorWithImageMock.mockResolvedValue(undefined);
  executeDownloadMock.mockResolvedValue(undefined);
  persistScenarioCaptureFromBackgroundMock.mockResolvedValue(undefined);
  saveScreenshotToMediaHubFromDataUrlMock.mockResolvedValue(undefined);
  transitionCaptureJobMock.mockResolvedValue(undefined);
  getPreauthorizedContentActionRouteMessageMock.mockReturnValue(undefined);
  sendTabMessageMock.mockResolvedValue({ success: true });
});

describe('capture-router-handlers.full', () => {
  it('handles full-capture settings and download failures', verifiesFullCaptureFailures);

  it('passes the full-page capture job id into the download router', async () => {
    const context = createContext();
    context.message = { actionType: 'download_default' };
    captureFullPageTransactionMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,job',
      jobId: 'capture-job-1',
      metadata: { downscaled: false, frozenExtentWarning: false },
    });

    expect(handleFullCapture(context)).toBe(true);
    await flushPromises();
    await flushPromises();

    expect(executeDownloadMock).toHaveBeenCalledWith(
      'data:image/png;base64,job',
      'full.jpeg',
      'download_default',
      undefined,
      'capture-job-1'
    );
    expect(context.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  });

  it('targets the bound document and reports downscale and frozen-extent warnings', async () => {
    const context = createContext();
    context.message = { actionType: 'download_default' };
    getPreauthorizedContentActionRouteMessageMock.mockReturnValue({
      documentId: 'document-42',
      tabId: 42,
    });
    captureFullPageTransactionMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,warned',
      jobId: 'capture-job-warned',
      metadata: { downscaled: true, frozenExtentWarning: true },
    });

    expect(handleFullCapture(context)).toBe(true);
    await flushPromises();
    await flushPromises();

    expect(captureFullPageTransactionMock).toHaveBeenCalledWith(42, undefined, {
      backendKind: 'native',
      documentId: 'document-42',
    });
    expect(sendTabMessageMock).toHaveBeenCalledWith(42, {
      payload: { message: expect.any(String), type: 'warning' },
      type: 'SHOW_TOAST',
    });
  });
});

async function verifiesFullCaptureFailures() {
  const settingsFailureContext = createContext();
  const downloadFailureContext = createContext();

  loadSettingsMock.mockRejectedValueOnce(new Error('settings failed')).mockResolvedValueOnce({
    captureAction: 'ask_system',
    imageFormat: 'png',
    saveCapturesToGallery: false,
  });
  captureFullPageTransactionMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,5',
    jobId: 'capture-job-full-download',
    metadata: { downscaled: false, frozenExtentWarning: false },
  });
  executeDownloadMock.mockRejectedValue(new Error('download failed'));

  expect(handleFullCapture(settingsFailureContext)).toBe(true);
  expect(
    handleFullCapture({
      ...downloadFailureContext,
      message: { actionType: 'download_default' },
    })
  ).toBe(true);

  await flushPromises();
  await flushPromises();

  expect(loadSettingsMock).toHaveBeenCalled();
  expect(generateFilenameMock).toHaveBeenCalledWith('full', 'png');
  expect(settingsFailureContext.sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'settings failed',
  });
  expect(downloadFailureContext.sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'download failed',
  });
}

describe('capture-router-handlers.full edit actions', () => {
  it('opens the editor for edit actions', async () => {
    const context = createContext();
    context.message = { actionType: 'edit' };
    captureFullPageTransactionMock.mockResolvedValueOnce({
      dataUrl: 'data:image/jpeg;base64,9',
      jobId: 'capture-job-full-edit',
      metadata: { downscaled: false, frozenExtentWarning: false },
    });

    expect(handleFullCapture(context)).toBe(true);
    await flushPromises();
    await flushPromises();

    expect(loadSettingsMock).toHaveBeenCalled();
    expect(generateFilenameMock).toHaveBeenCalledWith('full', 'jpeg');
    expect(openEditorWithImageMock).toHaveBeenCalledWith('data:image/jpeg;base64,9', {
      tabId: 42,
    });
    expect(context.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  });
});
