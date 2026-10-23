import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { handleRegionSelectionNavigationStart, requestRegionSelection } from './region-selection';
import type { RegionSelectionRequestBinding } from './region-selection.request-binding';
import { createRuntimeSubscriptionHarness } from './desktop-media.test-support';

const region = { x: 10, y: 20, width: 300, height: 200 };
const captureViewport = {
  devicePixelRatio: 2,
  height: 720,
  scrollX: 0,
  scrollY: 0,
  viewportOffsetX: 0,
  viewportOffsetY: 0,
  visualViewportScale: 1,
  width: 1280,
};
const selection = { captureViewport, region };

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
  showRecordingOverlay = vi.fn().mockResolvedValue(undefined),
  keepAlive = vi.fn().mockResolvedValue(true)
) {
  const runtime = createRuntimeSubscriptionHarness();
  const sendTabMessage = vi.fn().mockResolvedValue(undefined);
  const resultPromise = requestRegionSelection(42, {
    createRequestBinding: vi.fn().mockResolvedValue(binding),
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendTabMessage,
    probeRegionSelector: keepAlive,
    showRecordingOverlay,
    subscribeToMessages: runtime.subscribeToMessages,
  });
  return { binding, resultPromise, runtime, showRecordingOverlay, sendTabMessage, keepAlive };
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
    captureViewport,
    region,
  };
}

function cancelledMessage(binding: RegionSelectionRequestBinding) {
  return {
    type: VideoMessageType.REGION_SELECTION_CANCELLED,
    ...messageBinding(binding),
  };
}

it('acknowledges only an admitted selection through the runtime response contract', async () => {
  const request = createRequest();
  await Promise.resolve();
  const sendResponse = vi.fn();
  request.runtime.emit(selectedMessage(request.binding), sender({ frameId: 2 }), sendResponse);
  expect(sendResponse).not.toHaveBeenCalled();
  request.runtime.emit(selectedMessage(request.binding), sender(), sendResponse);
  expect(sendResponse).toHaveBeenCalledExactlyOnceWith({ success: true });
  await expect(request.resultPromise).resolves.toEqual(selection);
});

it('keeps a connected selection ready beyond any fixed preparation deadline', async () => {
  vi.useFakeTimers();
  const request = createRequest();
  await vi.advanceTimersByTimeAsync(1800000);
  expect(request.runtime.unsubscribe).not.toHaveBeenCalled();
  request.runtime.emit(selectedMessage(request.binding), sender());
  await expect(request.resultPromise).resolves.toEqual(selection);
  vi.useRealTimers();
});

it('ends preparation when the matching selector is no longer connected', async () => {
  vi.useFakeTimers();
  const request = createRequest();
  request.keepAlive.mockResolvedValue(false);
  await vi.advanceTimersByTimeAsync(20000);
  await expect(request.resultPromise).resolves.toBeNull();
  const expiresAtMs = request.binding.expiresAtMs;
  await vi.advanceTimersByTimeAsync(120000);
  expect(request.keepAlive).toHaveBeenCalledOnce();
  expect(request.binding.expiresAtMs).toBe(expiresAtMs);
  vi.useRealTimers();
});

it('does not overlap probes or renew an expired request from a late response', async () => {
  vi.useFakeTimers();
  const probe = createDeferred<boolean>();
  const keepAlive = vi.fn(() => probe.promise);
  const request = createRequest(createBinding(), undefined, keepAlive);
  const expiresAtMs = request.binding.expiresAtMs;
  await vi.advanceTimersByTimeAsync(60000);
  await expect(request.resultPromise).resolves.toBeNull();
  expect(keepAlive).toHaveBeenCalledOnce();
  probe.resolve(true);
  await vi.advanceTimersByTimeAsync(120000);
  expect(request.binding.expiresAtMs).toBe(expiresAtMs);
  expect(request.runtime.unsubscribe).toHaveBeenCalledOnce();
  expect(keepAlive).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('does not renew a replaced request when its old probe resolves late', async () => {
  vi.useFakeTimers();
  const probe = createDeferred<boolean>();
  const old = createRequest(
    createBinding(),
    undefined,
    vi.fn(() => probe.promise)
  );
  const oldExpiry = old.binding.expiresAtMs;
  await vi.advanceTimersByTimeAsync(21000);
  const latest = createRequest(createBinding({ regionSelectionRequestId: 'latest' }));
  await expect(old.resultPromise).resolves.toBeNull();
  probe.resolve(true);
  await vi.advanceTimersByTimeAsync(21000);
  expect(old.binding.expiresAtMs).toBe(oldExpiry);
  latest.runtime.emit(selectedMessage(latest.binding), sender());
  await expect(latest.resultPromise).resolves.toEqual(selection);
  vi.useRealTimers();
});

it.each(['selected', 'cancelled', 'navigation', 'timeout'] as const)(
  'keeps the pending region request alive and stops after %s',
  async (outcome) => {
    vi.useFakeTimers();
    const request = createRequest(createBinding({ expiresAtMs: Date.now() + 240000 }));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(65000);
    expect(request.keepAlive).toHaveBeenCalledTimes(3);
    expect(request.runtime.unsubscribe).not.toHaveBeenCalled();
    if (outcome === 'selected') request.runtime.emit(selectedMessage(request.binding), sender());
    if (outcome === 'cancelled') request.runtime.emit(cancelledMessage(request.binding), sender());
    if (outcome === 'navigation') handleRegionSelectionNavigationStart(42);
    if (outcome === 'timeout') {
      request.keepAlive.mockRejectedValue(new Error('connection lost'));
      await vi.advanceTimersByTimeAsync(60000);
    }
    await expect(request.resultPromise).resolves.toEqual(outcome === 'selected' ? selection : null);
    const calls = request.keepAlive.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(request.keepAlive).toHaveBeenCalledTimes(calls);
    expect(request.runtime.unsubscribe).toHaveBeenCalledOnce();
    if (outcome !== 'selected')
      expect(request.sendTabMessage).toHaveBeenLastCalledWith(42, {
        type: VideoMessageType.HIDE_REGION_SELECTOR,
        regionSelectionRequestId: request.binding.regionSelectionRequestId,
      });
    vi.useRealTimers();
  }
);

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

  await expect(request.resultPromise).resolves.toEqual(selection);
  expect(request.showRecordingOverlay).toHaveBeenCalledOnce();
});

it('retains a valid selection after a failed keepalive probe', async () => {
  vi.useFakeTimers();
  const keepAlive = vi
    .fn()
    .mockRejectedValueOnce(new Error('probe failed'))
    .mockResolvedValue(true);
  const request = createRequest(
    createBinding({ expiresAtMs: Date.now() + 240000 }),
    undefined,
    keepAlive
  );
  await vi.advanceTimersByTimeAsync(65000);
  expect(keepAlive).toHaveBeenCalledTimes(3);
  request.runtime.emit(selectedMessage(request.binding), sender());
  await expect(request.resultPromise).resolves.toEqual(selection);
  vi.useRealTimers();
});

it('does not display or keep alive a binding that already expired before delivery', async () => {
  const request = createRequest(createBinding({ expiresAtMs: Date.now() - 1 }));
  await expect(request.resultPromise).resolves.toBeNull();
  expect(request.sendTabMessage).not.toHaveBeenCalled();
  expect(request.keepAlive).not.toHaveBeenCalled();
  expect(handleRegionSelectionNavigationStart(42)).toBe(false);
});

it('stops keepalive and scopes cleanup after selector delivery fails', async () => {
  vi.useFakeTimers();
  const runtime = createRuntimeSubscriptionHarness();
  const pending = createDeferred<unknown>();
  const binding = createBinding({ expiresAtMs: Date.now() + 240000 });
  const keepAlive = vi.fn().mockResolvedValue(true);
  const sendTabMessage = vi.fn().mockResolvedValue(undefined).mockReturnValueOnce(pending.promise);
  const result = requestRegionSelection(42, {
    createRequestBinding: vi.fn().mockResolvedValue(binding),
    probeRegionSelector: keepAlive,
    logger: { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    sendTabMessage,
    showRecordingOverlay: vi.fn(),
    subscribeToMessages: runtime.subscribeToMessages,
  });
  await vi.advanceTimersByTimeAsync(21000);
  expect(keepAlive).toHaveBeenCalledOnce();
  pending.reject(new Error('delivery failed'));
  await expect(result).resolves.toBeNull();
  await vi.advanceTimersByTimeAsync(60000);
  expect(keepAlive).toHaveBeenCalledOnce();
  expect(sendTabMessage).toHaveBeenLastCalledWith(42, {
    type: VideoMessageType.HIDE_REGION_SELECTOR,
    regionSelectionRequestId: binding.regionSelectionRequestId,
  });
  vi.useRealTimers();
});

it('releases the old request keepalive on replacement without ending the new request', async () => {
  vi.useFakeTimers();
  const old = createRequest(createBinding({ expiresAtMs: Date.now() + 240000 }));
  await vi.advanceTimersByTimeAsync(21000);
  const latest = createRequest(
    createBinding({ regionSelectionRequestId: 'latest', expiresAtMs: Date.now() + 240000 })
  );
  await expect(old.resultPromise).resolves.toBeNull();
  await vi.advanceTimersByTimeAsync(21000);
  expect(old.keepAlive).toHaveBeenCalledOnce();
  expect(latest.keepAlive).toHaveBeenCalledOnce();
  latest.runtime.emit(selectedMessage(latest.binding), sender());
  await expect(latest.resultPromise).resolves.toEqual(selection);
  await vi.advanceTimersByTimeAsync(60000);
  expect(latest.keepAlive).toHaveBeenCalledOnce();
  vi.useRealTimers();
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

  await expect(request.resultPromise).resolves.toEqual(selection);
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
  await expect(request.resultPromise).resolves.toEqual(selection);
});

it('invalidates pending selection on timeout and navigation', async () => {
  vi.useFakeTimers();
  const timedOutRequest = createRequest();
  timedOutRequest.keepAlive.mockRejectedValue(new Error('connection lost'));
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

  await expect(latestResult).resolves.toEqual(selection);
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
  await expect(latestResult).resolves.toEqual(selection);
  expect(showRecordingOverlay).toHaveBeenCalledOnce();
});
