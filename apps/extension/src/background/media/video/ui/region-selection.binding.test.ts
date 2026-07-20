import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { handleRegionSelectionNavigationStart, requestRegionSelection } from './region-selection';
import type { RegionSelectionRequestBinding } from './region-selection.request-binding';
import { createRuntimeSubscriptionHarness } from './desktop-media.test-support';

const region = { x: 10, y: 20, width: 300, height: 200 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

function createBinding(
  overrides: Partial<RegionSelectionRequestBinding> = {}
): RegionSelectionRequestBinding {
  return {
    regionSelectionCapabilityToken: 'token-1',
    regionSelectionRequestGeneration: 'generation-1',
    regionSelectionRequestId: 'request-1',
    expiresAtMs: Date.now() + 60000,
    frameId: 0,
    senderUrl: 'https://example.com/page',
    tabId: 42,
    ...overrides,
  };
}

function messageBinding(binding: RegionSelectionRequestBinding) {
  return {
    regionSelectionCapabilityToken: binding.regionSelectionCapabilityToken,
    regionSelectionRequestGeneration: binding.regionSelectionRequestGeneration,
    regionSelectionRequestId: binding.regionSelectionRequestId,
  };
}

function sender(overrides: Partial<chrome.runtime.MessageSender> = {}) {
  return {
    frameId: 0,
    tab: { id: 42 },
    url: 'https://example.com/page',
    ...overrides,
  } as chrome.runtime.MessageSender;
}

function createRequest(
  binding = createBinding(),
  showRecordingOverlay = vi.fn().mockResolvedValue(undefined)
) {
  const runtime = createRuntimeSubscriptionHarness();
  const resultPromise = requestRegionSelection(42, {
    createRequestBinding: vi.fn().mockResolvedValue(binding),
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendTabMessage: vi.fn().mockResolvedValue(undefined),
    showRecordingOverlay,
    subscribeToMessages: runtime.subscribeToMessages,
  });
  return { binding, resultPromise, runtime, showRecordingOverlay };
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function selectedMessage(binding: RegionSelectionRequestBinding) {
  return {
    type: VideoMessageType.REGION_SELECTED,
    ...messageBinding(binding),
    region,
  };
}

function cancelledMessage(binding: RegionSelectionRequestBinding) {
  return {
    type: VideoMessageType.REGION_SELECTION_CANCELLED,
    ...messageBinding(binding),
  };
}

it('rejects stale request bindings before accepting the current selection', async () => {
  const request = createRequest();
  await Promise.resolve();

  request.runtime.emit(
    {
      ...selectedMessage(request.binding),
      regionSelectionRequestGeneration: 'stale-generation',
    },
    sender()
  );
  request.runtime.emit(
    {
      ...selectedMessage(request.binding),
      regionSelectionRequestId: 'stale-request',
    },
    sender()
  );
  request.runtime.emit(
    {
      ...selectedMessage(request.binding),
      regionSelectionCapabilityToken: 'stale-token',
    },
    sender()
  );
  await Promise.resolve();

  expect(request.showRecordingOverlay).not.toHaveBeenCalled();
  request.runtime.emit(selectedMessage(request.binding), sender());

  await expect(request.resultPromise).resolves.toEqual(region);
  expect(request.showRecordingOverlay).toHaveBeenCalledOnce();
});

it('requires exact tab, frame, document, and sender URL binding', async () => {
  const binding = createBinding({ documentId: 'doc-1' });
  const request = createRequest(binding);
  await Promise.resolve();

  request.runtime.emit(selectedMessage(binding), sender({ frameId: 1 }));
  request.runtime.emit(selectedMessage(binding), sender({ tab: { id: 7 } as chrome.tabs.Tab }));
  request.runtime.emit(selectedMessage(binding), sender({ documentId: 'doc-2' }));
  request.runtime.emit(selectedMessage(binding), sender({ url: 'https://evil.example/' }));
  await Promise.resolve();

  expect(request.showRecordingOverlay).not.toHaveBeenCalled();
  request.runtime.emit(selectedMessage(binding), sender({ documentId: 'doc-1' }));

  await expect(request.resultPromise).resolves.toEqual(region);
  expect(request.showRecordingOverlay).toHaveBeenCalledOnce();
});

it('consumes a valid selection response once', async () => {
  let resolveOverlay: () => void = () => undefined;
  const overlayRestored = new Promise<void>((resolve) => {
    resolveOverlay = resolve;
  });
  const request = createRequest(
    createBinding(),
    vi.fn(() => overlayRestored)
  );
  await Promise.resolve();

  request.runtime.emit(selectedMessage(request.binding), sender());
  request.runtime.emit(selectedMessage(request.binding), sender());

  expect(request.showRecordingOverlay).toHaveBeenCalledOnce();
  resolveOverlay();
  await expect(request.resultPromise).resolves.toEqual(region);
});

it('invalidates pending selection on timeout and navigation', async () => {
  vi.useFakeTimers();
  const timedOutRequest = createRequest();
  await Promise.resolve();

  await vi.advanceTimersByTimeAsync(60000);
  await expect(timedOutRequest.resultPromise).resolves.toBeNull();
  timedOutRequest.runtime.emit(selectedMessage(timedOutRequest.binding), sender());
  expect(timedOutRequest.showRecordingOverlay).not.toHaveBeenCalled();

  vi.useRealTimers();
  const navigatedRequest = createRequest(createBinding({ regionSelectionRequestId: 'request-2' }));
  await Promise.resolve();

  expect(handleRegionSelectionNavigationStart(42)).toBe(true);
  await expect(navigatedRequest.resultPromise).resolves.toBeNull();
  navigatedRequest.runtime.emit(selectedMessage(navigatedRequest.binding), sender());
  expect(navigatedRequest.showRecordingOverlay).not.toHaveBeenCalled();
});

it('accepts a bound cancellation and consumes later duplicate responses', async () => {
  const request = createRequest();
  await Promise.resolve();

  request.runtime.emit(cancelledMessage(request.binding), sender());
  request.runtime.emit(selectedMessage(request.binding), sender());

  await expect(request.resultPromise).resolves.toBeNull();
  expect(request.showRecordingOverlay).not.toHaveBeenCalled();
});

it('keeps the latest overlapping request active when older binding resolves late', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const oldBinding = createDeferred<RegionSelectionRequestBinding>();
  const newBinding = createDeferred<RegionSelectionRequestBinding>();
  const createRequestBinding = vi
    .fn()
    .mockReturnValueOnce(oldBinding.promise)
    .mockReturnValueOnce(newBinding.promise);
  const showRecordingOverlay = vi.fn().mockResolvedValue(undefined);
  const deps = {
    createRequestBinding,
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendTabMessage: vi.fn().mockResolvedValue(undefined),
    showRecordingOverlay,
    subscribeToMessages: runtime.subscribeToMessages,
  };

  const oldResult = requestRegionSelection(42, deps);
  const latest = createBinding({ regionSelectionRequestId: 'latest-request' });
  const latestResult = requestRegionSelection(42, deps);
  newBinding.resolve(latest);
  await Promise.resolve();
  oldBinding.resolve(createBinding({ regionSelectionRequestId: 'old-request' }));
  await Promise.resolve();

  runtime.emit(selectedMessage(latest), sender());

  await expect(latestResult).resolves.toEqual(region);
  await expect(oldResult).resolves.toBeNull();
  expect(showRecordingOverlay).toHaveBeenCalledOnce();
  expect(deps.sendTabMessage).toHaveBeenCalledTimes(1);
});

it('ignores older request errors after a newer request becomes active', async () => {
  const runtime = createRuntimeSubscriptionHarness();
  const oldBinding = createBinding({ regionSelectionRequestId: 'old-request' });
  const latest = createBinding({ regionSelectionRequestId: 'latest-request' });
  const createRequestBinding = vi
    .fn()
    .mockResolvedValueOnce(oldBinding)
    .mockResolvedValueOnce(latest);
  const oldSend = createDeferred<unknown>();
  const sendTabMessage = vi.fn().mockReturnValueOnce(oldSend.promise).mockResolvedValue(undefined);
  const showRecordingOverlay = vi.fn().mockResolvedValue(undefined);
  const deps = {
    createRequestBinding,
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendTabMessage,
    showRecordingOverlay,
    subscribeToMessages: runtime.subscribeToMessages,
  };

  const oldResult = requestRegionSelection(42, deps);
  await Promise.resolve();
  const latestResult = requestRegionSelection(42, deps);
  await Promise.resolve();
  await Promise.resolve();
  oldSend.reject(new Error('old request failed'));
  await Promise.resolve();

  runtime.emit(selectedMessage(latest), sender());

  await expect(oldResult).resolves.toBeNull();
  await expect(latestResult).resolves.toEqual(region);
  expect(showRecordingOverlay).toHaveBeenCalledOnce();
});
