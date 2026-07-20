import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { resolveCaptureSource } from './preflight.resolve';

type ResolveCaptureSourceDeps = NonNullable<Parameters<typeof resolveCaptureSource>[1]>;

function createResolveCaptureSourceDeps(
  overrides: Partial<ResolveCaptureSourceDeps> = {}
): ResolveCaptureSourceDeps {
  return {
    ensureOffscreenDocumentReady: vi.fn(),
    getCaptureSource: vi.fn(),
    localize: vi.fn(),
    logger: { debug: vi.fn(), warn: vi.fn() },
    notifyStartFailed: vi.fn(),
    requestDesktopMedia: vi.fn(),
    requestDisplayMediaSource: vi.fn(),
    requestRegionSelection: vi.fn(),
    sendRuntimeMessage: vi.fn() as unknown as ResolveCaptureSourceDeps['sendRuntimeMessage'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function registerScreenCaptureTests() {
  it(
    'returns the selected desktop capture source for screen recording',
    verifyScreenCaptureSuccess
  );
  it('reports desktop media cancellation and returns null', verifyScreenCaptureCancellation);
}

async function verifyScreenCaptureSuccess(): Promise<void> {
  const ensureOffscreenDocumentReady = vi.fn(async () => undefined);
  const requestDesktopMedia = vi.fn(async () => ({ label: 'Screen 1' }));
  const deps = createResolveCaptureSourceDeps({
    ensureOffscreenDocumentReady,
    requestDesktopMedia,
  });

  await expect(resolveScreenCaptureSource(deps)).resolves.toEqual({
    mode: CaptureMode.SCREEN,
    streamId: 'desktop',
    screenName: 'Screen 1',
  });

  expect(ensureOffscreenDocumentReady).toHaveBeenCalledWith('Recording tab video');
  expect(requestDesktopMedia).toHaveBeenCalledWith(CaptureMode.SCREEN, false);
  expect(deps.requestDisplayMediaSource).not.toHaveBeenCalled();
}

async function verifyScreenCaptureCancellation(): Promise<void> {
  const localize = vi.fn(() => 'selection cancelled');
  const notifyStartFailed = vi.fn();
  const deps = createResolveCaptureSourceDeps({
    ensureOffscreenDocumentReady: vi.fn(async () => undefined),
    localize,
    notifyStartFailed,
    requestDesktopMedia: vi.fn(async () => null),
  });

  await expect(resolveScreenCaptureSource(deps)).resolves.toBeNull();

  expect(localize).toHaveBeenCalledWith('background.runtime.sourceSelectionCancelled');
  expect(notifyStartFailed).toHaveBeenCalledWith('selection cancelled');
}

function resolveScreenCaptureSource(deps: ResolveCaptureSourceDeps) {
  return resolveCaptureSource(
    {
      captureMode: CaptureMode.SCREEN,
      tab: { id: 7 } as chrome.tabs.Tab,
      tabId: 7,
    },
    deps
  );
}

function registerTabCropSuccessTest() {
  it('requests region selection for TAB_CROP and attaches the chosen crop region', async () => {
    const captureSource = {
      mode: CaptureMode.TAB_CROP,
      streamId: 'stream-id',
      tabId: 42,
    };
    const requestRegionSelection = vi.fn(async () => ({
      height: 200,
      width: 300,
      x: 10,
      y: 20,
    }));
    const deps = createResolveCaptureSourceDeps({
      getCaptureSource: vi.fn(async () => captureSource),
      requestRegionSelection,
    });

    await expect(
      resolveCaptureSource(
        {
          captureMode: CaptureMode.TAB_CROP,
          tab: {
            favIconUrl: 'icon.png',
            id: 42,
            title: 'Title',
            url: 'https://example.com',
          } as chrome.tabs.Tab,
          tabId: 42,
        },
        deps
      )
    ).resolves.toEqual({
      ...captureSource,
      cropRegion: {
        height: 200,
        width: 300,
        x: 10,
        y: 20,
      },
      tabFavicon: 'icon.png',
      tabTitle: 'Title',
      tabUrl: 'https://example.com',
    });

    expect(requestRegionSelection).toHaveBeenCalledWith(42);
  });
}

function registerTabCropCancellationTest() {
  it('reports area-selection cancellation for TAB_CROP and returns null', async () => {
    const localize = vi.fn(() => 'area selection cancelled');
    const notifyStartFailed = vi.fn();
    const deps = createResolveCaptureSourceDeps({
      getCaptureSource: vi.fn(async () => ({
        mode: CaptureMode.TAB_CROP,
        streamId: 'stream-id',
        tabId: 42,
      })),
      localize,
      notifyStartFailed,
      requestRegionSelection: vi.fn(async () => null),
    });

    await expect(
      resolveCaptureSource(
        {
          captureMode: CaptureMode.TAB_CROP,
          tab: { id: 42, url: 'https://example.com' } as chrome.tabs.Tab,
          tabId: 42,
        },
        deps
      )
    ).resolves.toBeNull();

    expect(localize).toHaveBeenCalledWith('background.runtime.areaSelectionCancelled');
    expect(notifyStartFailed).toHaveBeenCalledWith('area selection cancelled');
  });
}

function registerTabCaptureFailureTest() {
  it('reports capture-source resolution failures and returns null', async () => {
    const notifyStartFailed = vi.fn();
    const deps = createResolveCaptureSourceDeps({
      getCaptureSource: vi.fn(async () => {
        throw new Error('capture failed');
      }),
      notifyStartFailed,
    });

    await expect(
      resolveCaptureSource(
        {
          captureMode: CaptureMode.TAB,
          tab: { id: 42, url: 'https://example.com' } as chrome.tabs.Tab,
          tabId: 42,
        },
        deps
      )
    ).resolves.toBeNull();

    expect(notifyStartFailed).toHaveBeenCalledWith('capture failed');
  });
}

describe('resolveCaptureSource screen capture', registerScreenCaptureTests);
describe('resolveCaptureSource tab crop', () => {
  registerTabCropSuccessTest();
  registerTabCropCancellationTest();
  registerTabCaptureFailureTest();
});
