import { beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n/index';

const {
  captureViewportWithClipTransactionMock,
  getErrorMessageMock,
  loadSettingsMock,
  loggerLogMock,
} = vi.hoisted(() => ({
  captureViewportWithClipTransactionMock: vi.fn(),
  getErrorMessageMock: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  loadSettingsMock: vi.fn(),
  loggerLogMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ log: loggerLogMock }),
}));

vi.mock('../../../platform/runtime-messaging/index', () => ({
  RuntimeMessagingDeps: undefined,
  RuntimeMessagingTransport: vi.fn(),
  createRuntimeMessagingTransport: vi.fn(),
  getErrorMessage: getErrorMessageMock,
  sendRuntimeMessage: vi.fn(),
  sendTabMessage: vi.fn(),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),

  loadSettings: loadSettingsMock,
}));

vi.mock('../index', () => ({
  captureAndDownloadFullPage: vi.fn(),
  captureAndDownloadVisible: vi.fn(),
  captureFullPage: vi.fn(),
  captureFullPageTransaction: vi.fn(),
  captureFullPageForArchive: vi.fn(),
  captureViewportWithClip: vi.fn(),
  captureViewportWithClipTransaction: captureViewportWithClipTransactionMock,
  captureVisibleTab: vi.fn(),
  captureVisibleTabForCrop: vi.fn(),
  captureVisibleTabForCropTransaction: vi.fn(),
  captureVisibleTabTransaction: vi.fn(),
}));

vi.mock('../download/download-router/index', () => ({
  buildDownloadFilename: vi.fn(),
  createDownloadRouterService: vi.fn(),
  executeDownload: vi.fn(),
  executeDownloadBlob: vi.fn(),
  resolvePresetPath: vi.fn(),
}));

vi.mock('../../media-hub/assets', () => ({
  saveScreenshotToMediaHubFromDataUrl: vi.fn(),
  updateGalleryImageAssetFromDataUrl: vi.fn(),
}));

vi.mock('../editor/index', () => ({
  openEditorWithImage: vi.fn(),
  resolveBlobFromPayload: vi.fn(),
}));

vi.mock('./scenario/index', () => ({
  persistScenarioCaptureFromBackground: vi.fn(),
}));

import { handleVisibleCapture, type CaptureRouteContext } from './handlers';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

function createContext(): CaptureRouteContext {
  return {
    resolvedTabId: 42,
    sendResponse: vi.fn(),
    viewportState: new Map([[42, { width: 1280, height: 720 }]]),
    screenshotModeState: new Map([[42, true]]),
    captureGuardState: { isCapturing: true },
    scenarioSessionService: createScenarioSessionServiceStub(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('rejects visible captures while another capture is already running', async () => {
  const context = createContext();

  expect(handleVisibleCapture(context)).toBe(true);
  await Promise.resolve();

  expect(loadSettingsMock).not.toHaveBeenCalled();
  expect(captureViewportWithClipTransactionMock).not.toHaveBeenCalled();
  expect(context.sendResponse).toHaveBeenCalledWith({
    success: false,
    error: translate('background.runtime.captureAlreadyRunning'),
  });
});
