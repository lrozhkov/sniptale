import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const {
  cropImageMock,
  disableNavigationLockMock,
  enableSelectionModeDeferredIfCurrentMock,
  enableNavigationLockMock,
  hideAllToastsMock,
  persistBackgroundCaptureMock,
  persistSelectionCaptureMock,
  sendRuntimeMessageMock,
  setUIHiddenMock,
  showToastMock,
} = vi.hoisted(() => ({
  cropImageMock: vi.fn(),
  disableNavigationLockMock: vi.fn(),
  enableSelectionModeDeferredIfCurrentMock: vi.fn(),
  enableNavigationLockMock: vi.fn(),
  hideAllToastsMock: vi.fn(),
  persistBackgroundCaptureMock: vi.fn(),
  persistSelectionCaptureMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setUIHiddenMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/browser/media/image-crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-crop')>()),
  cropImage: cropImageMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  hideAllToasts: hideAllToastsMock,
  showToast: showToastMock,
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  disableNavigationLock: disableNavigationLockMock,
  enableNavigationLock: enableNavigationLockMock,
  setUIHidden: setUIHiddenMock,
}));

vi.mock('../../../selection/selection-mode/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/selection-mode/lazy')>()),
  enableSelectionModeDeferredIfCurrent: enableSelectionModeDeferredIfCurrentMock,
}));

vi.mock('../persistence', () => ({
  persistBackgroundCapture: persistBackgroundCaptureMock,
  persistSelectionCapture: persistSelectionCaptureMock,
}));

import { runSelectionScreenshot, runViewportScreenshot } from './run';
import type { ScreenshotControllerRuntime } from '../types';

function createScenarioPayload() {
  return {
    captureSurface: 'visible' as const,
    sourceKind: 'manual' as const,
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1000, height: 800 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
  };
}

function createRuntime(actionType: 'download_default' | 'scenario'): ScreenshotControllerRuntime & {
  scenario: NonNullable<ScreenshotControllerRuntime['scenario']>;
} {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: actionType },
    navigationLockStateBeforeScreenshot: { current: false },
    screenshotRunActiveRef: { current: false },
    screenshotRunGenerationRef: { current: 1 },
    scenario: {
      buildCapturePayload: vi.fn(() => createScenarioPayload()),
      ensureCaptureReady: vi.fn(async () => undefined),
      refreshSession: vi.fn(async () => undefined),
      saveSelectionCapture: vi.fn(async () => undefined),
    },
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };
}

async function settleCaptureTimers() {
  await vi.advanceTimersByTimeAsync(500);
}

async function expectNormalDownloadViewportCapture() {
  const runtime = createRuntime('download_default');

  const capturePromise = runViewportScreenshot('visible', runtime, {
    showSuccessToast: false,
  });
  await settleCaptureTimers();
  await capturePromise;

  expect(setUIHiddenMock).toHaveBeenCalledWith(true);
  expect(runtime.scenario.ensureCaptureReady).not.toHaveBeenCalled();
  expect(runtime.scenario.buildCapturePayload).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'CAPTURE_VISIBLE',
    actionType: 'download_default',
    scenarioCapture: undefined,
  });
  expect(runtime.scenario.refreshSession).not.toHaveBeenCalled();
}

async function expectScenarioViewportCapture() {
  const runtime = createRuntime('scenario');

  const capturePromise = runViewportScreenshot('visible', runtime, {
    showSuccessToast: false,
  });
  await settleCaptureTimers();
  await capturePromise;

  expect(runtime.scenario.ensureCaptureReady).toHaveBeenCalledTimes(1);
  expect(runtime.scenario.buildCapturePayload).toHaveBeenCalledWith('visible');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'CAPTURE_VISIBLE',
    actionType: 'scenario',
    scenarioCapture: createScenarioPayload(),
  });
  expect(runtime.scenario.refreshSession).toHaveBeenCalledTimes(1);
}

async function expectSelectionCaptureRetry() {
  const runtime = createRuntime('download_default');
  sendRuntimeMessageMock
    .mockResolvedValueOnce({ success: false, error: 'capture warming up' })
    .mockResolvedValueOnce({ success: true, dataUrl: 'data:image/png;base64,retry' });

  const capturePromise = runSelectionScreenshot(runtime, {
    showSuccessToast: false,
  });
  await settleCaptureTimers();
  await capturePromise;

  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(2);
  expect(cropImageMock).toHaveBeenCalledWith('data:image/png;base64,retry', {
    x: 0,
    y: 0,
    width: 100,
    height: 80,
  });
}

async function expectNormalSelectionCaptureNoScenarioSave() {
  const runtime = createRuntime('download_default');

  const capturePromise = runSelectionScreenshot(runtime, {
    showSuccessToast: false,
  });
  await settleCaptureTimers();
  await capturePromise;

  expect(persistSelectionCaptureMock).toHaveBeenCalledWith(
    expect.objectContaining({
      actionType: 'download_default',
    })
  );
  expect(runtime.scenario.ensureCaptureReady).not.toHaveBeenCalled();
  expect(runtime.scenario.saveSelectionCapture).not.toHaveBeenCalled();
  expect(runtime.scenario.refreshSession).not.toHaveBeenCalled();
}

async function expectScenarioSelectionCaptureWaitsForScenarioReadiness() {
  const runtime = createRuntime('scenario');

  const capturePromise = runSelectionScreenshot(runtime, {
    showSuccessToast: false,
  });
  await settleCaptureTimers();
  await capturePromise;

  expect(runtime.scenario.ensureCaptureReady).toHaveBeenCalledTimes(1);
  expect(runtime.scenario.saveSelectionCapture).toHaveBeenCalledWith(
    'data:image/png;base64,crop',
    'selection',
    expect.any(Function)
  );
}

async function expectViewportFailureRestoresVisibleUiState() {
  const runtime = createRuntime('download_default');
  persistBackgroundCaptureMock.mockRejectedValueOnce(new Error('persist failed'));

  const capturePromise = runViewportScreenshot('visible', runtime, {
    showSuccessToast: false,
  });
  const captureExpectation = expect(capturePromise).rejects.toThrow('persist failed');
  await settleCaptureTimers();
  await captureExpectation;
  expect(runtime.setIsCompletelyHidden).toHaveBeenNthCalledWith(1, true);
  expect(runtime.setIsCompletelyHidden).toHaveBeenLastCalledWith(false);
  expect(runtime.setIsToolbarVisible).toHaveBeenNthCalledWith(1, false);
  expect(runtime.setIsToolbarVisible).toHaveBeenLastCalledWith(true);
  expect(setUIHiddenMock).toHaveBeenLastCalledWith(false);
}

async function expectSelectionFailureRestoresVisibleUiState() {
  const runtime = createRuntime('download_default');
  persistSelectionCaptureMock.mockRejectedValueOnce(new Error('persist failed'));

  const capturePromise = runSelectionScreenshot(runtime, {
    showSuccessToast: false,
  });
  const captureExpectation = expect(capturePromise).rejects.toThrow('persist failed');
  await settleCaptureTimers();
  await captureExpectation;
  expect(runtime.setIsCompletelyHidden).toHaveBeenNthCalledWith(1, true);
  expect(runtime.setIsCompletelyHidden).toHaveBeenLastCalledWith(false);
  expect(runtime.setIsToolbarVisible).toHaveBeenNthCalledWith(1, false);
  expect(runtime.setIsToolbarVisible).toHaveBeenLastCalledWith(true);
  expect(setUIHiddenMock).toHaveBeenCalledWith(true);
  expect(setUIHiddenMock).toHaveBeenLastCalledWith(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  vi.useFakeTimers();
  const requestAnimationFrameMock: typeof requestAnimationFrame = (callback) => {
    setTimeout(() => callback(0), 0);
    return 0;
  };
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
  persistBackgroundCaptureMock.mockResolvedValue({ successMessage: null });
  persistSelectionCaptureMock.mockResolvedValue({ successMessage: null });
  sendRuntimeMessageMock.mockResolvedValue({
    success: true,
    dataUrl: 'data:image/png;base64,frame',
  });
  enableSelectionModeDeferredIfCurrentMock.mockResolvedValue({
    x: 0,
    y: 0,
    width: 100,
    height: 80,
  });
  cropImageMock.mockResolvedValue('data:image/png;base64,crop');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('screenshot-controller capture scenario gating', () => {
  it(
    'does not attach scenario payloads or refresh the scenario session for normal downloads',
    expectNormalDownloadViewportCapture
  );
  it(
    'keeps scenario payloads and session refresh for explicit scenario captures',
    expectScenarioViewportCapture
  );
  it(
    'retries selection capture after the next paint settle instead of failing on the first empty response',
    expectSelectionCaptureRetry
  );
  it(
    'does not save selection captures into the scenario when the action is a normal download',
    expectNormalSelectionCaptureNoScenarioSave
  );
  it(
    'waits for scenario capture readiness before saving selection captures into the scenario',
    expectScenarioSelectionCaptureWaitsForScenarioReadiness
  );
  it(
    'restores visible UI state when viewport persistence fails after hiding the runtime shell',
    expectViewportFailureRestoresVisibleUiState
  );
  it(
    'restores visible UI state when selection capture fails after the overlay is hidden',
    expectSelectionFailureRestoresVisibleUiState
  );
});
