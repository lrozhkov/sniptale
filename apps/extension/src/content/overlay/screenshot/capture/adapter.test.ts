import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  cropImageMock,
  disableNavigationLockMock,
  enableSelectionModeDeferredIfCurrentMock,
  enableNavigationLockMock,
  hideAllToastsMock,
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
  persistBackgroundCapture: vi.fn(),
  persistSelectionCapture: persistSelectionCaptureMock,
}));

import { runSelectionScreenshot, runViewportScreenshot } from './run';
import type { ScreenshotControllerRuntime } from '../types';

function createRuntime(): ScreenshotControllerRuntime {
  return {
    captureActionRef: { current: 'download_default' },
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    navigationLockStateBeforeScreenshot: { current: false },
    screenshotRunActiveRef: { current: false },
    screenshotRunGenerationRef: { current: 1 },
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };
}

function createScenarioRuntime(): ScreenshotControllerRuntime & {
  scenario: NonNullable<ScreenshotControllerRuntime['scenario']>;
} {
  return {
    ...createRuntime(),
    scenario: {
      ensureCaptureReady: vi.fn(async () => undefined),
      refreshSession: vi.fn(async () => undefined),
      saveSelectionCapture: vi.fn(async () => undefined),
    },
  };
}

async function settleCaptureTimers() {
  await vi.advanceTimersByTimeAsync(500);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  const requestAnimationFrameMock: typeof requestAnimationFrame = (callback) => {
    setTimeout(() => callback(0), 0);
    return 0;
  };
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
  persistSelectionCaptureMock.mockResolvedValue({ successMessage: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function expectViewerVisibleCaptureUsesAdapter() {
  const runtime = createRuntime();
  runtime.captureAdapter = {
    captureSelection: vi.fn(),
    captureViewport: vi.fn().mockResolvedValue('data:image/png;base64,viewer-visible'),
  };

  const capturePromise = runViewportScreenshot('visible', runtime, {
    showSuccessToast: false,
  });
  await settleCaptureTimers();
  await capturePromise;

  expect(setUIHiddenMock).toHaveBeenCalledWith(true);
  expect(runtime.captureAdapter.captureViewport).toHaveBeenCalledWith('visible');
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'CAPTURE_VISIBLE' })
  );
  expect(persistSelectionCaptureMock).toHaveBeenCalledWith(
    expect.objectContaining({
      dataUrl: 'data:image/png;base64,viewer-visible',
      mode: 'visible',
    })
  );
}

async function expectViewerSelectionCaptureUsesAdapter() {
  const runtime = createRuntime();
  runtime.captureAdapter = {
    captureSelection: vi.fn().mockResolvedValue('data:image/png;base64,viewer-selection'),
    captureViewport: vi.fn(),
  };

  const capturePromise = runSelectionScreenshot(runtime, {
    showSuccessToast: false,
  });
  await settleCaptureTimers();
  await capturePromise;

  expect(setUIHiddenMock).toHaveBeenCalledWith(true);
  expect(runtime.captureAdapter.captureSelection).toHaveBeenCalledTimes(1);
  expect(enableSelectionModeDeferredIfCurrentMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'CAPTURE_VISIBLE_FOR_CROP' })
  );
  expect(cropImageMock).not.toHaveBeenCalled();
}

async function expectViewerAdapterFailureRestoresVisibleUiState() {
  const runtime = createRuntime();
  runtime.captureAdapter = {
    captureSelection: vi.fn(),
    captureViewport: vi.fn().mockRejectedValue(new Error('viewer render failed')),
  };

  const capturePromise = runViewportScreenshot('visible', runtime, {
    showSuccessToast: false,
  });
  const captureExpectation = expect(capturePromise).rejects.toThrow('viewer render failed');
  await settleCaptureTimers();
  await captureExpectation;

  expect(setUIHiddenMock).toHaveBeenNthCalledWith(1, true);
  expect(runtime.setIsCompletelyHidden).toHaveBeenLastCalledWith(false);
  expect(runtime.setIsToolbarVisible).toHaveBeenLastCalledWith(true);
  expect(setUIHiddenMock).toHaveBeenLastCalledWith(false);
}

async function expectViewerAdapterCaptureSavesActiveScenarioSession() {
  const runtime = createScenarioRuntime();
  runtime.captureAdapter = {
    captureSelection: vi.fn(),
    captureViewport: vi.fn().mockResolvedValue('data:image/png;base64,viewer-visible'),
  };

  const capturePromise = runViewportScreenshot('visible', runtime, {
    showSuccessToast: false,
  });
  await settleCaptureTimers();
  await capturePromise;

  expect(runtime.captureAdapter.captureViewport).toHaveBeenCalledWith('visible');
  expect(runtime.scenario.saveSelectionCapture).toHaveBeenCalledWith(
    'data:image/png;base64,viewer-visible',
    'visible',
    expect.any(Function)
  );
  expect(runtime.scenario.refreshSession).toHaveBeenCalledTimes(1);
  expect(sendRuntimeMessageMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'CAPTURE_VISIBLE' })
  );
}

async function expectStaleViewerAdapterCaptureSkipsPersistenceAndFeedback() {
  const runtime = createScenarioRuntime();
  runtime.captureAdapter = {
    captureSelection: vi.fn(),
    captureViewport: vi.fn().mockImplementation(async () => {
      runtime.screenshotRunGenerationRef.current = 2;
      return 'data:image/png;base64,stale-viewer';
    }),
  };

  const capturePromise = runViewportScreenshot('visible', runtime, {
    runToken: 1,
    showSuccessToast: true,
  });
  const captureExpectation = expect(capturePromise).rejects.toMatchObject({
    name: 'StaleScreenshotRunError',
  });
  await settleCaptureTimers();
  await captureExpectation;

  expect(persistSelectionCaptureMock).not.toHaveBeenCalled();
  expect(showToastMock).not.toHaveBeenCalled();
  expect(runtime.scenario.saveSelectionCapture).not.toHaveBeenCalled();
  expect(runtime.scenario.refreshSession).not.toHaveBeenCalled();
}

describe('screenshot-controller viewer capture adapter', () => {
  it(
    'uses a viewer capture adapter for visible screenshots without regular tab capture messages',
    expectViewerVisibleCaptureUsesAdapter
  );
  it(
    'uses a viewer capture adapter for selection screenshots without regular tab crop messages',
    expectViewerSelectionCaptureUsesAdapter
  );
  it(
    'restores hidden toolbar state when the viewer capture adapter fails',
    expectViewerAdapterFailureRestoresVisibleUiState
  );
  it(
    'saves adapter captures into the active scenario session without regular tab capture messages',
    expectViewerAdapterCaptureSavesActiveScenarioSession
  );
  it(
    'skips adapter persistence and feedback when the run is superseded in flight',
    expectStaleViewerAdapterCaptureSkipsPersistenceAndFeedback
  );
});
