import { beforeEach, expect, it, vi } from 'vitest';

const {
  executeDownloadMock,
  generateFilenameMock,
  loadSettingsMock,
  openEditorWithImageMock,
  persistScenarioCaptureFromBackgroundMock,
  saveScreenshotToMediaHubFromDataUrlMock,
} = vi.hoisted(() => ({
  executeDownloadMock: vi.fn(),
  generateFilenameMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  openEditorWithImageMock: vi.fn(),
  persistScenarioCaptureFromBackgroundMock: vi.fn(),
  saveScreenshotToMediaHubFromDataUrlMock: vi.fn(),
}));

vi.mock('../download/download-router/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download/download-router/index')>()),
  executeDownload: executeDownloadMock,
}));

vi.mock('../editor/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor/index')>()),
  openEditorWithImage: openEditorWithImageMock,
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: loadSettingsMock,
}));

vi.mock('@sniptale/foundation/utils/filename', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/filename')>()),
  generateFilename: generateFilenameMock,
}));

vi.mock('../../media-hub/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media-hub/assets')>()),
  saveScreenshotToMediaHubFromDataUrl: saveScreenshotToMediaHubFromDataUrlMock,
}));

vi.mock('../application/scenario-capture-persistence', () => ({
  persistScenarioCaptureFromBackground: persistScenarioCaptureFromBackgroundMock,
}));

import {
  createCaptureDeliveryPromise,
  createVisibleCapturePromise,
  maybePersistScreenshotInMediaHub,
  resolveScenarioCaptureForAction,
  runPreparedCaptureAction,
  respondWithCaptureAction,
} from './handlers.shared';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';
import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';

beforeEach(() => {
  vi.clearAllMocks();
  executeDownloadMock.mockResolvedValue(undefined);
  openEditorWithImageMock.mockResolvedValue(undefined);
  persistScenarioCaptureFromBackgroundMock.mockResolvedValue(undefined);
  saveScreenshotToMediaHubFromDataUrlMock.mockResolvedValue('asset-1');
  loadSettingsMock.mockResolvedValue({
    captureAction: 'download_default',
    defaultImagePresetId: 'preset-1',
    imageFormat: 'png',
    saveCapturesToGallery: false,
  });
  generateFilenameMock.mockReturnValue('visible.png');
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createScenarioCapturePayload(): ScenarioRuntimeCapturePayload {
  return {
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: 'Example',
      url: 'https://example.test',
      viewport: { height: 720, width: 1280, x: 0, y: 0 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  };
}

it('routes capture persistence helper decisions', async () => {
  const noGallery = await maybePersistScreenshotInMediaHub(
    { saveCapturesToGallery: false },
    'data:image/png;base64,1',
    'visible.png',
    42
  );
  const withGallery = await maybePersistScreenshotInMediaHub(
    { saveCapturesToGallery: true },
    'data:image/png;base64,2',
    'visible.png',
    42
  );

  expect(noGallery).toBeNull();
  expect(withGallery).toBe('asset-1');
  expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
    'data:image/png;base64,2',
    'visible.png',
    42
  );
});

it('routes scenario capture helper decisions', () => {
  expect(
    resolveScenarioCaptureForAction({
      captureAction: 'scenario',
      scenarioCapture: createScenarioCapturePayload(),
    })
  ).toEqual(expect.objectContaining({ captureSurface: 'visible' }));
  expect(
    resolveScenarioCaptureForAction({
      captureAction: 'copy',
      scenarioCapture: createScenarioCapturePayload(),
    })
  ).toBeUndefined();
});

it('routes viewport and crop capture promise selection', async () => {
  const viewportCapture = vi.fn().mockResolvedValue('data:image/png;base64,3');
  const cropCapture = vi.fn().mockResolvedValue('data:image/png;base64,4');

  await expect(
    createVisibleCapturePromise(
      viewportCapture,
      cropCapture,
      42,
      new Map([[42, { width: 1, height: 1 }]])
    )
  ).resolves.toBe('data:image/png;base64,3');
  await expect(
    createVisibleCapturePromise(viewportCapture, cropCapture, 42, new Map([[42, null]]))
  ).resolves.toBe('data:image/png;base64,4');
});

it('routes edit and copy responses', async () => {
  const editResponse = vi.fn();
  const copyResponse = vi.fn();

  await respondWithCaptureAction(Promise.resolve('data:image/png;base64,5'), {
    resolvedTabId: 42,
    sendResponse: editResponse,
    captureAction: 'edit',
    filename: 'visible.png',
  });
  await respondWithCaptureAction(Promise.resolve('data:image/png;base64,6'), {
    resolvedTabId: 42,
    sendResponse: copyResponse,
    captureAction: 'copy',
    filename: 'visible.png',
  });

  await flushPromises();

  expect(openEditorWithImageMock).toHaveBeenCalledWith('data:image/png;base64,5', {
    tabId: 42,
  });
  expect(editResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(copyResponse).toHaveBeenCalledWith({
    success: true,
    dataUrl: 'data:image/png;base64,6',
    action: 'copy',
  });
});

it('routes download and scenario responses', async () => {
  const downloadResponse = vi.fn();
  const scenarioResponse = vi.fn();

  await respondWithCaptureAction(Promise.resolve('data:image/png;base64,7'), {
    resolvedTabId: 42,
    sendResponse: downloadResponse,
    captureAction: 'download_default',
    filename: 'visible.png',
    defaultImagePresetId: 'preset-1',
  });
  await respondWithCaptureAction(Promise.resolve('data:image/png;base64,8'), {
    resolvedTabId: 42,
    sendResponse: scenarioResponse,
    captureAction: 'scenario',
    filename: 'visible.png',
  });

  await flushPromises();

  expect(executeDownloadMock).toHaveBeenCalledWith(
    'data:image/png;base64,7',
    'visible.png',
    'download_default',
    'preset-1',
    undefined
  );
  expect(downloadResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(scenarioResponse).toHaveBeenCalledWith({ success: true, action: 'scenario' });
});

it('persists gallery and scenario payloads before returning the captured data url', async () => {
  const capturePromise = createCaptureDeliveryPromise(Promise.resolve('data:image/png;base64,9'), {
    settings: {
      defaultImagePresetId: null,
      saveCapturesToGallery: true,
    },
    filename: 'visible.png',
    resolvedTabId: 42,
    captureAction: 'scenario',
    scenarioCapture: createScenarioCapturePayload(),
    scenarioSessionService: createScenarioSessionServiceStub(),
  });

  await expect(capturePromise).resolves.toBe('data:image/png;base64,9');
  expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
    'data:image/png;base64,9',
    'visible.png',
    42
  );
  expect(persistScenarioCaptureFromBackgroundMock).toHaveBeenCalledWith(
    expect.objectContaining({
      dataUrl: 'data:image/png;base64,9',
      galleryAssetId: 'asset-1',
      scenarioCapture: expect.objectContaining({ captureSurface: 'visible' }),
      tabId: 42,
    })
  );
});

it('prepares capture action settings and delivers the resulting response', async () => {
  const sendResponse = vi.fn();

  await runPreparedCaptureAction({
    context: {
      resolvedTabId: 42,
      sendResponse,
      viewportState: new Map(),
      screenshotModeState: new Map(),
      captureGuardState: { isCapturing: false },
      scenarioSessionService: createScenarioSessionServiceStub(),
      message: { actionType: 'copy' },
    },
    captureTarget: 'visible',
    capture: () => Promise.resolve('data:image/png;base64,10'),
  });

  await flushPromises();

  expect(loadSettingsMock).toHaveBeenCalled();
  expect(generateFilenameMock).toHaveBeenCalledWith('visible', 'png');
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    dataUrl: 'data:image/png;base64,10',
    action: 'copy',
  });
});
