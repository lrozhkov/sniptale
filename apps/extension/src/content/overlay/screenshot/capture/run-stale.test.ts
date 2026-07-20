import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
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

function createRuntime(
  actionType: 'copy' | 'scenario' = 'scenario'
): ScreenshotControllerRuntime & {
  scenario: NonNullable<ScreenshotControllerRuntime['scenario']>;
} {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: actionType },
    navigationLockStateBeforeScreenshot: { current: false },
    screenshotRunActiveRef: { current: true },
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

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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
  persistBackgroundCaptureMock.mockResolvedValue({ successMessage: 'Saved' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function expectStaleBackgroundViewportSkipsPersistenceAndFeedback() {
  const runtime = createRuntime();
  sendRuntimeMessageMock.mockImplementationOnce(async () => {
    runtime.screenshotRunGenerationRef.current = 2;
    return {
      dataUrl: 'data:image/png;base64,stale',
      success: true,
    };
  });

  const capturePromise = runViewportScreenshot('visible', runtime, {
    runToken: 1,
    showSuccessToast: true,
  });
  const captureExpectation = expect(capturePromise).rejects.toMatchObject({
    name: 'StaleScreenshotRunError',
  });
  await settleCaptureTimers();
  await captureExpectation;

  expect(persistBackgroundCaptureMock).not.toHaveBeenCalled();
  expect(showToastMock).not.toHaveBeenCalled();
  expect(runtime.scenario.refreshSession).not.toHaveBeenCalled();
}

async function expectStaleBackgroundViewportSkipsDispatchAfterSettingsAwait() {
  const runtime = createRuntime('copy');
  const settings = createDeferred<{ saveCapturesToGallery: boolean }>();
  loadSettingsMock.mockReturnValueOnce(settings.promise);

  const capturePromise = runViewportScreenshot('visible', runtime, {
    runToken: 1,
    showSuccessToast: false,
  });
  const captureExpectation = expect(capturePromise).rejects.toMatchObject({
    name: 'StaleScreenshotRunError',
  });

  await settleCaptureTimers();
  runtime.screenshotRunGenerationRef.current = 2;
  settings.resolve({ saveCapturesToGallery: false });
  await captureExpectation;

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(persistBackgroundCaptureMock).not.toHaveBeenCalled();
}

describe('screenshot-controller stale capture runs', () => {
  it(
    'skips background viewport persistence and feedback when the run is superseded in flight',
    expectStaleBackgroundViewportSkipsPersistenceAndFeedback
  );
  it(
    'skips background viewport dispatch when the run is superseded before request send',
    expectStaleBackgroundViewportSkipsDispatchAfterSettingsAwait
  );
});
