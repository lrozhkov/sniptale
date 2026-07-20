import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { requestDesktopMedia } from './desktop-media';
import {
  createDesktopMediaCancelledMessage,
  createDesktopMediaObtainedMessage,
  createRequestDeps,
  createRuntimeSubscriptionHarness,
  createSendRuntimeMessageMock,
} from './desktop-media.test-support';
import { requestRegionSelection } from './region-selection';
import type { RegionSelectionRequestBinding } from './region-selection.request-binding';

beforeEach(() => {
  vi.clearAllMocks();
});

async function verifyDesktopMediaRequestSuccess() {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();

  const resultPromise = requestDesktopMedia(CaptureMode.SCREEN, true, {
    ...createRequestDeps({ runtime, sendRuntimeMessage }),
  });

  runtime.emit(createDesktopMediaObtainedMessage(sendRuntimeMessage, 'Screen 1'));

  await expect(resultPromise).resolves.toEqual({ label: 'Screen 1' });
  expect(sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.GET_DESKTOP_MEDIA,
      capabilityToken: expect.any(String),
      captureMode: CaptureMode.SCREEN,
      desktopMediaRequestGeneration: expect.any(String),
      desktopMediaRequestId: expect.any(String),
      controlledCursorCaptureEnabled: true,
    })
  );
  expect(runtime.unsubscribe).toHaveBeenCalledOnce();
}

async function verifyDesktopMediaCancellation() {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();

  const resultPromise = requestDesktopMedia(CaptureMode.SCREEN, false, {
    ...createRequestDeps({ runtime, sendRuntimeMessage }),
  });

  runtime.emit(createDesktopMediaCancelledMessage(sendRuntimeMessage));

  await expect(resultPromise).resolves.toBeNull();
  expect(runtime.unsubscribe).toHaveBeenCalledOnce();
}

async function verifyDesktopMediaRequestFailure() {
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock().mockRejectedValue(
    new Error('request failed')
  );

  const resultPromise = requestDesktopMedia(CaptureMode.SCREEN, false, {
    ...createRequestDeps({ runtime, sendRuntimeMessage }),
  });

  await expect(resultPromise).resolves.toBeNull();
  expect(runtime.unsubscribe).toHaveBeenCalledOnce();
}

async function verifyDesktopMediaTimeout() {
  vi.useFakeTimers();
  const runtime = createRuntimeSubscriptionHarness();
  const sendRuntimeMessage = createSendRuntimeMessageMock();

  const resultPromise = requestDesktopMedia(CaptureMode.SCREEN, false, {
    ...createRequestDeps({ runtime, sendRuntimeMessage }),
  });

  await vi.advanceTimersByTimeAsync(60000);

  await expect(resultPromise).resolves.toBeNull();
  expect(runtime.unsubscribe).toHaveBeenCalledOnce();

  vi.useRealTimers();
}

describe('requestDesktopMedia', () => {
  it(
    'resolves with the obtained desktop label and unsubscribes the runtime listener',
    verifyDesktopMediaRequestSuccess
  );
  it(
    'resolves with null when desktop media selection is cancelled',
    verifyDesktopMediaCancellation
  );
  it(
    'resolves with null when the desktop media request fails before a selection arrives',
    verifyDesktopMediaRequestFailure
  );
  it('resolves with null when desktop media selection times out', verifyDesktopMediaTimeout);
});

describe('requestRegionSelection success paths', () => {
  it(
    'shows the selector and resolves with the selected region for the target tab',
    verifyRegionSelectionSuccess
  );
  it('ignores selection messages from other tabs', verifyRegionSelectionIgnoresOtherTabs);
});

function createRegionSelectionBinding(
  overrides: Partial<RegionSelectionRequestBinding> = {}
): RegionSelectionRequestBinding {
  return {
    regionSelectionCapabilityToken: 'region-token-1',
    regionSelectionRequestGeneration: 'region-generation-1',
    regionSelectionRequestId: 'region-request-1',
    expiresAtMs: Date.now() + 60000,
    frameId: 0,
    tabId: 42,
    ...overrides,
  };
}

function createRegionSelectionMessageBinding(binding: RegionSelectionRequestBinding) {
  return {
    regionSelectionCapabilityToken: binding.regionSelectionCapabilityToken,
    regionSelectionRequestGeneration: binding.regionSelectionRequestGeneration,
    regionSelectionRequestId: binding.regionSelectionRequestId,
  };
}

function createRegionSelectionSender(
  overrides: Partial<chrome.runtime.MessageSender> = {}
): chrome.runtime.MessageSender {
  return {
    frameId: 0,
    tab: { id: 42 },
    ...overrides,
  } as chrome.runtime.MessageSender;
}

function createRegionSelectionRequest(
  binding: RegionSelectionRequestBinding = createRegionSelectionBinding()
) {
  const runtime = createRuntimeSubscriptionHarness();
  const createRequestBinding = vi.fn().mockResolvedValue(binding);
  const sendTabMessage = vi.fn().mockResolvedValue(undefined);
  const showRecordingOverlay = vi.fn().mockResolvedValue(undefined);
  const resultPromise = requestRegionSelection(42, {
    createRequestBinding,
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendTabMessage,
    showRecordingOverlay,
    subscribeToMessages: runtime.subscribeToMessages,
  });

  return { binding, resultPromise, runtime, sendTabMessage, showRecordingOverlay };
}

async function verifyRegionSelectionSuccess(): Promise<void> {
  const request = createRegionSelectionRequest();
  const region = { x: 10, y: 20, width: 300, height: 200 };
  await Promise.resolve();

  request.runtime.emit(
    {
      type: VideoMessageType.REGION_SELECTED,
      ...createRegionSelectionMessageBinding(request.binding),
      region,
    },
    createRegionSelectionSender()
  );

  await expect(request.resultPromise).resolves.toEqual(region);
  expect(request.sendTabMessage).toHaveBeenCalledWith(42, {
    type: VideoMessageType.SHOW_REGION_SELECTOR,
    ...createRegionSelectionMessageBinding(request.binding),
  });
  expect(request.showRecordingOverlay).toHaveBeenCalledWith(42, region);
  expect(request.runtime.unsubscribe).toHaveBeenCalledOnce();
}

async function verifyRegionSelectionIgnoresOtherTabs(): Promise<void> {
  const request = createRegionSelectionRequest();
  await Promise.resolve();

  request.runtime.emit(
    {
      type: VideoMessageType.REGION_SELECTED,
      ...createRegionSelectionMessageBinding(request.binding),
      region: { x: 1, y: 2, width: 3, height: 4 },
    },
    createRegionSelectionSender({ tab: { id: 7 } as chrome.tabs.Tab })
  );

  await Promise.resolve();
  expect(request.showRecordingOverlay).not.toHaveBeenCalled();

  request.runtime.emit(
    {
      type: VideoMessageType.REGION_SELECTION_CANCELLED,
      ...createRegionSelectionMessageBinding(request.binding),
    },
    createRegionSelectionSender()
  );

  await expect(request.resultPromise).resolves.toBeNull();
  expect(request.runtime.unsubscribe).toHaveBeenCalledOnce();
}

describe('requestRegionSelection failure paths', () => {
  it('still resolves with the selected region when overlay restoration fails', async () => {
    const runtime = createRuntimeSubscriptionHarness();
    const binding = createRegionSelectionBinding();
    const sendTabMessage = vi.fn().mockResolvedValue(undefined);
    const showRecordingOverlay = vi.fn().mockRejectedValue(new Error('overlay failed'));

    const resultPromise = requestRegionSelection(42, {
      createRequestBinding: vi.fn().mockResolvedValue(binding),
      logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
      sendTabMessage,
      showRecordingOverlay,
      subscribeToMessages: runtime.subscribeToMessages,
    });

    const region = { x: 50, y: 25, width: 640, height: 360 };
    await Promise.resolve();
    runtime.emit(
      {
        type: VideoMessageType.REGION_SELECTED,
        ...createRegionSelectionMessageBinding(binding),
        region,
      },
      createRegionSelectionSender()
    );

    await expect(resultPromise).resolves.toEqual(region);
    expect(showRecordingOverlay).toHaveBeenCalledWith(42, region);
    expect(runtime.unsubscribe).toHaveBeenCalledOnce();
  });

  it('resolves with null when showing the region selector fails', async () => {
    const runtime = createRuntimeSubscriptionHarness();
    const binding = createRegionSelectionBinding();
    const sendTabMessage = vi.fn().mockRejectedValue(new Error('selector failed'));
    const showRecordingOverlay = vi.fn().mockResolvedValue(undefined);

    const resultPromise = requestRegionSelection(42, {
      createRequestBinding: vi.fn().mockResolvedValue(binding),
      logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
      sendTabMessage,
      showRecordingOverlay,
      subscribeToMessages: runtime.subscribeToMessages,
    });

    await expect(resultPromise).resolves.toBeNull();
    expect(showRecordingOverlay).not.toHaveBeenCalled();
    expect(runtime.unsubscribe).toHaveBeenCalledOnce();
  });
});
