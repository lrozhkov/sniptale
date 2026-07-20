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

async function verifyViewportPresetRequired() {
  const notifyStartFailed = vi.fn();
  const localize = vi.fn(() => 'preset required');
  const deps = createResolveCaptureSourceDeps({
    localize,
    notifyStartFailed,
  });

  await expect(
    resolveCaptureSource(
      {
        captureMode: CaptureMode.VIEWPORT_EMULATION,
        tab: { id: 7 } as chrome.tabs.Tab,
        tabId: 7,
      },
      deps
    )
  ).resolves.toBeNull();

  expect(localize).toHaveBeenCalledWith('background.runtime.viewportPresetRequired');
  expect(notifyStartFailed).toHaveBeenCalledWith('preset required');
}

async function verifyScreenCaptureSuccess() {
  const deps = createResolveCaptureSourceDeps({
    requestDesktopMedia: vi.fn(async () => ({ id: 'screen-1', label: 'Screen 1' })),
  });

  await expect(
    resolveCaptureSource(
      {
        captureMode: CaptureMode.SCREEN,
        controlledCursorCaptureEnabled: true,
        tab: { id: 7 } as chrome.tabs.Tab,
        tabId: 7,
      },
      deps
    )
  ).resolves.toEqual({
    mode: CaptureMode.SCREEN,
    streamId: 'desktop',
    screenName: 'Screen 1',
  });

  expect(deps.ensureOffscreenDocumentReady).toHaveBeenCalledWith('Recording tab video');
  expect(deps.requestDesktopMedia).toHaveBeenCalledWith(CaptureMode.SCREEN, true);
}

async function verifyTabCropCancellation() {
  const deps = createResolveCaptureSourceDeps({
    getCaptureSource: vi.fn(async () => ({
      mode: CaptureMode.TAB_CROP,
      streamId: 'stream-1',
      tabId: 7,
    })),
    localize: vi.fn((key: string) => key),
    requestRegionSelection: vi.fn(async () => null),
  });

  await expect(
    resolveCaptureSource(
      {
        captureMode: CaptureMode.TAB_CROP,
        tab: { id: 7, title: 'Example' } as chrome.tabs.Tab,
        tabId: 7,
      },
      deps
    )
  ).resolves.toBeNull();

  expect(deps.notifyStartFailed).toHaveBeenCalledWith('background.runtime.areaSelectionCancelled');
}

async function verifyStringifiedTabCaptureFailure() {
  const deps = createResolveCaptureSourceDeps({
    getCaptureSource: vi.fn(async () => {
      throw 'capture blocked';
    }),
  });

  await expect(
    resolveCaptureSource(
      {
        captureMode: CaptureMode.TAB,
        tab: { id: 7 } as chrome.tabs.Tab,
        tabId: 7,
      },
      deps
    )
  ).resolves.toBeNull();

  expect(deps.notifyStartFailed).toHaveBeenCalledWith('capture blocked');
}

async function verifyScreenCaptureCancellation() {
  const deps = createResolveCaptureSourceDeps({
    localize: vi.fn((key: string) => key),
    requestDesktopMedia: vi.fn(async () => null),
  });

  await expect(
    resolveCaptureSource(
      {
        captureMode: CaptureMode.SCREEN,
        tab: { id: 7 } as chrome.tabs.Tab,
        tabId: 7,
      },
      deps
    )
  ).resolves.toBeNull();

  expect(deps.notifyStartFailed).toHaveBeenCalledWith(
    'background.runtime.sourceSelectionCancelled'
  );
}

async function verifyTabCropSuccessIncludesTabMetadata() {
  const deps = createResolveCaptureSourceDeps({
    getCaptureSource: vi.fn(async () => ({
      mode: CaptureMode.TAB_CROP,
      streamId: 'stream-1',
      tabId: 7,
    })),
    requestRegionSelection: vi.fn(async () => ({
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    })),
  });

  await expect(
    resolveCaptureSource(
      {
        captureMode: CaptureMode.TAB_CROP,
        tab: {
          id: 7,
          title: 'Example',
          url: 'https://example.test/page',
          favIconUrl: 'https://example.test/icon.png',
        } as chrome.tabs.Tab,
        tabId: 7,
      },
      deps
    )
  ).resolves.toEqual({
    mode: CaptureMode.TAB_CROP,
    streamId: 'stream-1',
    tabId: 7,
    tabTitle: 'Example',
    tabUrl: 'https://example.test/page',
    tabFavicon: 'https://example.test/icon.png',
    cropRegion: {
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    },
  });
}

describe('resolveCaptureSource viewport preset', () => {
  it('notifies when viewport emulation starts without a preset', verifyViewportPresetRequired);

  it(
    'resolves screen capture after offscreen readiness and desktop source selection',
    verifyScreenCaptureSuccess
  );

  it('returns null when area selection is cancelled for TAB_CROP mode', verifyTabCropCancellation);

  it(
    'returns null and forwards stringified tab-capture failures',
    verifyStringifiedTabCaptureFailure
  );

  it(
    'notifies when desktop source selection is cancelled for SCREEN mode',
    verifyScreenCaptureCancellation
  );

  it(
    'returns a crop-aware source with tab metadata when TAB_CROP selection succeeds',
    verifyTabCropSuccessIncludesTabMetadata
  );
});
