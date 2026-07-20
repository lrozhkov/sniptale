import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeRuntimeMessagingTransport } from '../../../../platform/runtime-messaging/fake';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { resolveCaptureSource } from './preflight.resolve';

function createChromeTab(): chrome.tabs.Tab {
  return {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id: 7,
    incognito: false,
    index: 0,
    pinned: false,
    selected: true,
    windowId: 1,
  };
}

function createResolveCaptureSourceDeps(overrides: Record<string, unknown> = {}) {
  const transport = new FakeRuntimeMessagingTransport();
  return {
    ensureOffscreenDocumentReady: vi.fn(),
    getCaptureSource: vi.fn(),
    localize: vi.fn((key: string) => key),
    logger: { debug: vi.fn(), log: vi.fn(), warn: vi.fn() },
    notifyStartFailed: vi.fn(),
    requestDesktopMedia: vi.fn(),
    requestDisplayMediaSource: vi.fn(),
    requestRegionSelection: vi.fn(),
    sendRuntimeMessage: transport.sendRuntimeMessage.bind(transport),
    transport,
    ...overrides,
  };
}

function createScreenCaptureParams() {
  return {
    captureMode: CaptureMode.SCREEN,
    sourceCount: 2,
    tab: createChromeTab(),
    tabId: 7,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function verifyMultiScreenCaptureSequentialSelection() {
  const requestDisplayMediaSource = vi
    .fn()
    .mockImplementationOnce(async (_captureMode, options) => {
      await options.beforeDesktopStreamAcquire();
      return { label: 'Window 1' };
    })
    .mockImplementationOnce(async (_captureMode, options) => {
      await options.beforeDesktopStreamAcquire();
      return { label: 'Window 2' };
    });
  const ensureOffscreenDocumentReady = vi.fn(async () => undefined);
  const deps = createResolveCaptureSourceDeps({
    ensureOffscreenDocumentReady,
    requestDisplayMediaSource,
  });

  await expect(resolveCaptureSource(createScreenCaptureParams(), deps)).resolves.toEqual({
    mode: CaptureMode.SCREEN,
    streamId: 'desktop-multi',
    screenName: 'Window 1, Window 2',
  });

  expect(requestDisplayMediaSource).toHaveBeenNthCalledWith(1, CaptureMode.SCREEN, {
    beforeDesktopStreamAcquire: expect.any(Function),
    controlledCursorCaptureEnabled: false,
    sourceCount: 2,
    sourceIndex: 0,
  });
  expect(requestDisplayMediaSource).toHaveBeenNthCalledWith(2, CaptureMode.SCREEN, {
    beforeDesktopStreamAcquire: expect.any(Function),
    controlledCursorCaptureEnabled: false,
    sourceCount: 2,
    sourceIndex: 1,
  });
  expect(ensureOffscreenDocumentReady).toHaveBeenCalledTimes(2);
}

async function verifyMultiScreenCaptureDoesNotBlockFirstPickerOnOffscreenReadiness() {
  const ensureOffscreenDocumentReady = vi.fn(async () => undefined);
  const requestDisplayMediaSource = vi.fn(async (_captureMode, options) => {
    await options.beforeDesktopStreamAcquire();
    return { label: 'Window 1' };
  });
  const deps = createResolveCaptureSourceDeps({
    ensureOffscreenDocumentReady,
    requestDisplayMediaSource,
  });

  await expect(resolveCaptureSource(createScreenCaptureParams(), deps)).resolves.toEqual({
    mode: CaptureMode.SCREEN,
    streamId: 'desktop-multi',
    screenName: 'Window 1, Window 1',
  });

  expect(requestDisplayMediaSource).toHaveBeenCalledTimes(2);
  expect(ensureOffscreenDocumentReady).toHaveBeenCalledTimes(2);
}

async function verifyMultiScreenCaptureRollbackOnCancellation() {
  const deps = createResolveCaptureSourceDeps({
    requestDisplayMediaSource: vi
      .fn()
      .mockResolvedValueOnce({ label: 'Window 1' })
      .mockResolvedValueOnce(null),
  });

  await expect(resolveCaptureSource(createScreenCaptureParams(), deps)).resolves.toBeNull();

  expect(deps.transport.runtimeRequests).toContainEqual(
    expect.objectContaining({
      type: 'DISPOSE_DESKTOP_MEDIA',
      capabilityToken: expect.any(String),
    })
  );
  expect(deps.notifyStartFailed).toHaveBeenCalledWith(
    'background.runtime.sourceSelectionCancelled'
  );
}

async function verifyMultiScreenCaptureReportsPickerFailure() {
  const deps = createResolveCaptureSourceDeps({
    requestDisplayMediaSource: vi.fn(async () => {
      throw new Error('getDisplayMedia failed');
    }),
  });

  await expect(resolveCaptureSource(createScreenCaptureParams(), deps)).resolves.toBeNull();

  expect(deps.notifyStartFailed).toHaveBeenCalledWith('background.runtime.sourcePreparationFailed');
}

describe('resolveCaptureSource multi-screen preflight', () => {
  it(
    'resolves multi-screen capture through sequential source selection',
    verifyMultiScreenCaptureSequentialSelection
  );

  it(
    'prepares offscreen before each multi-screen display-media request',
    verifyMultiScreenCaptureDoesNotBlockFirstPickerOnOffscreenReadiness
  );

  it(
    'disposes prepared multi-screen sources when a later selection is cancelled',
    verifyMultiScreenCaptureRollbackOnCancellation
  );

  it(
    'reports multi-screen display-media acquire failures separately from cancellation',
    verifyMultiScreenCaptureReportsPickerFailure
  );
});
