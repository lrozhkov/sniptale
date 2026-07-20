import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const {
  loadSettingsMock,
  persistBackgroundCaptureMock,
  persistSelectionCaptureMock,
  sendRuntimeMessageMock,
  setUIHiddenMock,
  showToastMock,
} = vi.hoisted(() => ({
  loadSettingsMock: vi.fn(),
  persistBackgroundCaptureMock: vi.fn(),
  persistSelectionCaptureMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  setUIHiddenMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  setUIHidden: setUIHiddenMock,
}));

vi.mock('../persistence', () => ({
  persistBackgroundCapture: persistBackgroundCaptureMock,
  persistSelectionCapture: persistSelectionCaptureMock,
}));

import { runViewportScreenshot } from './run';
import type { ScreenshotControllerRuntime } from '../types';

function createRuntime(
  actionType: 'copy' | 'download_default' = 'copy'
): ScreenshotControllerRuntime {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: actionType },
    navigationLockStateBeforeScreenshot: { current: false },
    screenshotRunActiveRef: { current: false },
    screenshotRunGenerationRef: { current: 1 },
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };
}

function trackPromiseOutcome(promise: Promise<unknown>): () => string {
  let outcome = 'pending';
  void promise.then(
    () => {
      outcome = 'resolved';
    },
    (error) => {
      outcome = error instanceof Error ? error.message : String(error);
    }
  );
  return () => outcome;
}

async function settleHiddenUiFrames(): Promise<void> {
  await vi.advanceTimersByTimeAsync(100);
}

function expectVisibleUiRestored(runtime: ScreenshotControllerRuntime): void {
  expect(runtime.setIsCompletelyHidden).toHaveBeenLastCalledWith(false);
  expect(runtime.setIsToolbarVisible).toHaveBeenLastCalledWith(true);
  expect(setUIHiddenMock).toHaveBeenLastCalledWith(false);
}

function createDeferredCaptureResponse() {
  let resolveResponse: (response: { dataUrl: string; success: boolean }) => void = () => undefined;
  const promise = new Promise<{ dataUrl: string; success: boolean }>((resolve) => {
    resolveResponse = resolve;
  });
  return { promise, resolveResponse };
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
  loadSettingsMock.mockResolvedValue({ saveCapturesToGallery: false });
  persistBackgroundCaptureMock.mockResolvedValue({ successMessage: null });
  persistSelectionCaptureMock.mockResolvedValue({ successMessage: null });
  sendRuntimeMessageMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,frame',
    success: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('restores visible UI when a side-effect-free background response never settles', async () => {
  const runtime = createRuntime();
  sendRuntimeMessageMock.mockImplementationOnce(() => new Promise(() => undefined));

  const capturePromise = runViewportScreenshot('visible', runtime, {
    showSuccessToast: false,
  });
  const getOutcome = trackPromiseOutcome(capturePromise);

  await settleHiddenUiFrames();
  expect(sendRuntimeMessageMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60_000);
  await Promise.resolve();

  expect(getOutcome()).toBe('content.runtime.screenshotCaptureTimedOut');
  expectVisibleUiRestored(runtime);
});

it('does not persist a late inline response after the response watchdog fires', async () => {
  const runtime = createRuntime();
  const deferred = createDeferredCaptureResponse();
  sendRuntimeMessageMock.mockReturnValueOnce(deferred.promise);

  const capturePromise = runViewportScreenshot('visible', runtime, {
    showSuccessToast: false,
  });
  const getOutcome = trackPromiseOutcome(capturePromise);

  await settleHiddenUiFrames();
  await vi.advanceTimersByTimeAsync(60_000);
  deferred.resolveResponse({ dataUrl: 'data:image/png;base64,late', success: true });
  await Promise.resolve();

  expect(getOutcome()).toBe('content.runtime.screenshotCaptureTimedOut');
  expectVisibleUiRestored(runtime);
  expect(persistBackgroundCaptureMock).not.toHaveBeenCalled();
});

it('does not timeout background-owned delivery responses with possible side effects', async () => {
  const runtime = createRuntime('download_default');
  sendRuntimeMessageMock.mockImplementationOnce(() => new Promise(() => undefined));

  const capturePromise = runViewportScreenshot('visible', runtime, {
    showSuccessToast: false,
  });
  const getOutcome = trackPromiseOutcome(capturePromise);

  await settleHiddenUiFrames();
  await vi.advanceTimersByTimeAsync(60_000);
  await Promise.resolve();

  expect(getOutcome()).toBe('pending');
  expect(runtime.setIsCompletelyHidden).not.toHaveBeenLastCalledWith(false);
});
