import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  VIEWPORT_NAVIGATION_SETTLE_MS,
  refreshViewportRecordingAfterNavigation,
  shouldRefreshViewportRecordingAfterNavigation,
  shouldRestoreCropOverlayAfterNavigation,
} from './index';

const { attachDebugger, resetZoom, setViewport } = vi.hoisted(() => ({
  attachDebugger: vi.fn(),
  resetZoom: vi.fn(),
  setViewport: vi.fn(),
}));

const runtimeSendMessage = vi.fn();
const viewportPreset = {
  id: 'desktop',
  label: 'Desktop',
  width: 1920,
  height: 1080,
};

vi.mock('../../../debugger/session/attach', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../debugger/session/attach')>();

  return {
    ...actual,
    attachDebugger,
  };
});

vi.mock('../../../debugger/workspace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../debugger/workspace')>();

  return {
    ...actual,
    resetZoom,
    setViewport,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  attachDebugger.mockResolvedValue(undefined);
  resetZoom.mockResolvedValue(undefined);
  setViewport.mockResolvedValue({
    cssWidth: 1364.8,
    cssHeight: 768.2,
    scale: 0.71,
  });
  runtimeSendMessage.mockResolvedValue(undefined);

  Object.assign(globalThis, {
    chrome: {
      runtime: {
        sendMessage: runtimeSendMessage,
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function expectCropMessage() {
  expect(runtimeSendMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP,
      targetResolution: {
        width: 1920,
        height: 1080,
      },
      emulatedViewportCssSize: {
        width: 1365,
        height: 768,
      },
    })
  );
}

it('updates crop before unfreezing the draw loop', async () => {
  const refreshPromise = refreshViewportRecordingAfterNavigation({
    tabId: 42,
    viewportPreset,
    navigationEpoch: 3,
    isCurrentNavigationEpoch: () => true,
  });

  await vi.advanceTimersByTimeAsync(VIEWPORT_NAVIGATION_SETTLE_MS);
  await refreshPromise;

  expectCropMessage();
  expect(runtimeSendMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
      frozen: false,
      navigationEpoch: 3,
    })
  );
});

it('does not unfreeze when the navigation epoch becomes stale after crop refresh', async () => {
  const isCurrentNavigationEpoch = vi
    .fn<() => boolean>()
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);

  const refreshPromise = refreshViewportRecordingAfterNavigation({
    tabId: 42,
    viewportPreset,
    navigationEpoch: 4,
    isCurrentNavigationEpoch,
  });

  await vi.advanceTimersByTimeAsync(VIEWPORT_NAVIGATION_SETTLE_MS);
  await refreshPromise;

  expect(runtimeSendMessage).toHaveBeenCalledTimes(1);
  expectCropMessage();
});

it('stops before sending crop updates when the navigation epoch is already stale', async () => {
  const isCurrentNavigationEpoch = vi.fn<() => boolean>().mockReturnValueOnce(false);

  await refreshViewportRecordingAfterNavigation({
    tabId: 42,
    viewportPreset,
    navigationEpoch: 2,
    isCurrentNavigationEpoch,
  });

  expect(runtimeSendMessage).not.toHaveBeenCalled();
});

it('stops after crop refresh when the navigation epoch becomes stale before settle wait', async () => {
  const isCurrentNavigationEpoch = vi
    .fn<() => boolean>()
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);

  await refreshViewportRecordingAfterNavigation({
    tabId: 42,
    viewportPreset,
    navigationEpoch: 6,
    isCurrentNavigationEpoch,
  });

  expect(runtimeSendMessage).toHaveBeenCalledTimes(1);
  expectCropMessage();
});

it('unfreezes after a retried refresh still fails, so the recording does not stay on the old frame', async () => {
  attachDebugger.mockRejectedValue(new Error('Target closed'));

  const refreshPromise = refreshViewportRecordingAfterNavigation({
    tabId: 42,
    viewportPreset,
    navigationEpoch: 5,
    isCurrentNavigationEpoch: () => true,
  });

  await vi.advanceTimersByTimeAsync(VIEWPORT_NAVIGATION_SETTLE_MS);
  await refreshPromise;

  expect(attachDebugger).toHaveBeenCalledTimes(2);
  expect(runtimeSendMessage).toHaveBeenCalledTimes(1);
  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
      frozen: false,
      navigationEpoch: 5,
    })
  );
});

it('swallows unfreeze failures after the refresh retry budget is exhausted', async () => {
  attachDebugger.mockRejectedValue(new Error('Target closed'));
  runtimeSendMessage.mockRejectedValueOnce(new Error('offscreen unavailable'));

  const refreshPromise = refreshViewportRecordingAfterNavigation({
    tabId: 42,
    viewportPreset,
    navigationEpoch: 7,
    isCurrentNavigationEpoch: () => true,
  });

  await vi.advanceTimersByTimeAsync(VIEWPORT_NAVIGATION_SETTLE_MS);
  await expect(refreshPromise).resolves.toBeUndefined();
  expect(runtimeSendMessage).toHaveBeenCalledTimes(1);
});

it('exposes helper predicates for viewport refresh and crop overlay restore', () => {
  expect(shouldRefreshViewportRecordingAfterNavigation(1, 1, CaptureMode.VIEWPORT_EMULATION)).toBe(
    true
  );
  expect(shouldRefreshViewportRecordingAfterNavigation(1, 2, CaptureMode.VIEWPORT_EMULATION)).toBe(
    false
  );
  expect(shouldRestoreCropOverlayAfterNavigation(1, 1, CaptureMode.TAB_CROP)).toBe(true);
  expect(shouldRestoreCropOverlayAfterNavigation(1, 1, CaptureMode.VIEWPORT_EMULATION)).toBe(false);
});
