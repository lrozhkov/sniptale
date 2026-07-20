import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserDebuggerMock,
  browserTabsMock,
  loggerDebugMock,
  loggerErrorMock,
  loggerWarnMock,
  withTimeoutMock,
} = vi.hoisted(() => ({
  browserDebuggerMock: {
    sendCommand: vi.fn(),
  },
  browserTabsMock: {
    get: vi.fn(),
    setZoom: vi.fn(),
  },
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  withTimeoutMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger: browserDebuggerMock,
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: browserTabsMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

vi.mock('../infra', () => ({
  keepServiceWorkerAlive: vi.fn(),
  withTimeout: withTimeoutMock,
}));

import { clearViewport, resetZoom, setViewport } from './index';

beforeEach(() => {
  vi.clearAllMocks();
  withTimeoutMock.mockImplementation((promise: Promise<unknown>) => promise);
  browserDebuggerMock.sendCommand.mockResolvedValue({
    visualViewport: { clientWidth: 1280, clientHeight: 720 },
  });
  browserTabsMock.get.mockResolvedValue({ windowId: 3 });
  browserTabsMock.setZoom.mockResolvedValue(undefined);
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      windows: {
        get: vi.fn().mockResolvedValue({ width: 1600, height: 1000 }),
      },
    },
  });
});

async function verifyViewportEmulationAppliesFromFreshMetrics() {
  browserDebuggerMock.sendCommand
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({
      visualViewport: { clientWidth: 1400, clientHeight: 900 },
    })
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({
      visualViewport: { clientWidth: 1280, clientHeight: 720 },
      contentSize: { width: 1280, height: 720 },
    });

  await expect(setViewport(9, 1280, 720)).resolves.toEqual({
    cssHeight: 720,
    cssWidth: 1280,
    scale: 1,
  });

  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    1,
    { tabId: 9 },
    'Emulation.clearDeviceMetricsOverride'
  );
  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    2,
    { tabId: 9 },
    'Page.getLayoutMetrics'
  );
  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    3,
    { tabId: 9 },
    'Emulation.setDeviceMetricsOverride',
    expect.objectContaining({ height: 720, scale: 1, width: 1280 })
  );
  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    4,
    { tabId: 9 },
    'Page.getLayoutMetrics'
  );
}

async function verifyViewportEmulationFallsBackToWindowMetrics() {
  browserDebuggerMock.sendCommand
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('cdp unavailable'))
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({
      visualViewport: { clientWidth: 960, clientHeight: 540 },
    });

  await expect(setViewport(11, 1920, 1080)).resolves.toEqual({
    cssHeight: 540,
    cssWidth: 960,
    scale: 0.8333333333333334,
  });

  expect(browserTabsMock.get).toHaveBeenCalledWith(11);
}

async function verifyReplayedPresetClearsStaleEmulatedMetrics() {
  let clearSeen = false;
  browserDebuggerMock.sendCommand.mockImplementation((_target, method, params) => {
    if (method === 'Emulation.clearDeviceMetricsOverride') {
      clearSeen = true;
      return Promise.resolve(undefined);
    }

    if (method === 'Page.getLayoutMetrics') {
      return Promise.resolve({
        visualViewport: clearSeen
          ? { clientWidth: 1600, clientHeight: 940 }
          : { clientWidth: 1280, clientHeight: 760 },
      });
    }

    return Promise.resolve(params);
  });

  await expect(setViewport(17, 1920, 1080)).resolves.toEqual({
    cssHeight: 940,
    cssWidth: 1600,
    scale: 0.8333333333333334,
  });

  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    1,
    { tabId: 17 },
    'Emulation.clearDeviceMetricsOverride'
  );
  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    2,
    { tabId: 17 },
    'Page.getLayoutMetrics'
  );
  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    3,
    { tabId: 17 },
    'Emulation.setDeviceMetricsOverride',
    expect.objectContaining({ height: 1080, scale: 0.8333333333333334, width: 1920 })
  );
}

function runDebuggerWorkspaceSetViewportSuite() {
  it(
    'applies viewport emulation and returns CSS dimensions from layout metrics',
    verifyViewportEmulationAppliesFromFreshMetrics
  );
  it(
    'falls back to window metrics when CDP layout metrics are unavailable',
    verifyViewportEmulationFallsBackToWindowMetrics
  );
  it(
    'clears stale emulated metrics before measuring the workspace for a replayed preset',
    verifyReplayedPresetClearsStaleEmulatedMetrics
  );
}

function runDebuggerWorkspaceCleanupSuite() {
  it('clears viewport emulation through the debugger transport', async () => {
    await expect(clearViewport(5)).resolves.toBeUndefined();

    expect(browserDebuggerMock.sendCommand).toHaveBeenCalledWith(
      { tabId: 5 },
      'Emulation.clearDeviceMetricsOverride'
    );
  });

  it('resets tab zoom through the shared tabs adapter', async () => {
    await expect(resetZoom(4)).resolves.toBeUndefined();
    expect(browserTabsMock.setZoom).toHaveBeenCalledWith(4, 1);
  });
}

function runDebuggerWorkspaceFallbackSuite() {
  it('uses the default workspace when the fallback tab has no window id', async () => {
    browserDebuggerMock.sendCommand
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cdp unavailable'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        visualViewport: { clientWidth: 800, clientHeight: 600 },
      });
    browserTabsMock.get.mockResolvedValue({ windowId: undefined });

    await expect(setViewport(13, 1920, 1080)).resolves.toEqual({
      cssHeight: 600,
      cssWidth: 800,
      scale: 1,
    });
  });

  it('uses layout-viewport workspace metrics when visual viewport details are unavailable', async () => {
    browserDebuggerMock.sendCommand
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        layoutViewport: { clientWidth: 1500, clientHeight: 900 },
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        visualViewport: { clientWidth: 1000, clientHeight: 600 },
      });

    await expect(setViewport(21, 1920, 1080)).resolves.toEqual({
      cssHeight: 600,
      cssWidth: 1000,
      scale: 0.78125,
    });
  });
}

function runDebuggerWorkspaceErrorSuite() {
  it('rethrows clear/reset failures after logging them', async () => {
    const clearError = new Error('clear failed');
    const zoomError = new Error('zoom failed');

    browserDebuggerMock.sendCommand.mockRejectedValueOnce(clearError);
    browserTabsMock.setZoom.mockRejectedValueOnce(zoomError);

    await expect(clearViewport(5)).rejects.toThrow('clear failed');
    await expect(resetZoom(4)).rejects.toThrow('zoom failed');
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to clear viewport', clearError);
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to reset zoom', zoomError);
  });
}

describe('debugger-workspace setViewport', runDebuggerWorkspaceSetViewportSuite);
describe('debugger-workspace cleanup', runDebuggerWorkspaceCleanupSuite);
describe('debugger-workspace fallback', runDebuggerWorkspaceFallbackSuite);
describe('debugger-workspace errors', runDebuggerWorkspaceErrorSuite);
