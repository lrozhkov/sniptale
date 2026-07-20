import { beforeEach, expect, it, vi } from 'vitest';
import { clearViewportOverride, overrideDeviceMetrics, resetTabZoom } from './commands';

const { browserDebuggerMock, browserTabsMock, loggerErrorMock, withTimeoutMock } = vi.hoisted(
  () => ({
    browserDebuggerMock: {
      sendCommand: vi.fn(),
    },
    browserTabsMock: {
      setZoom: vi.fn(),
    },
    loggerErrorMock: vi.fn(),
    withTimeoutMock: vi.fn(),
  })
);

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger: browserDebuggerMock,
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: browserTabsMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../infra', () => ({
  keepServiceWorkerAlive: vi.fn(),
  withTimeout: withTimeoutMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  withTimeoutMock.mockImplementation((promise: Promise<unknown>) => promise);
  browserTabsMock.setZoom.mockResolvedValue(undefined);
});

it('applies device metrics override through the timeout wrapper', async () => {
  await expect(overrideDeviceMetrics(9, 1280, 720, 1)).resolves.toBeUndefined();

  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledWith(
    { tabId: 9 },
    'Emulation.setDeviceMetricsOverride',
    expect.objectContaining({
      width: 1280,
      height: 720,
      scale: 1,
    })
  );
});

it('clears viewport emulation through the debugger transport', async () => {
  await expect(clearViewportOverride(5)).resolves.toBeUndefined();

  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledWith(
    { tabId: 5 },
    'Emulation.clearDeviceMetricsOverride'
  );
});

it('resets tab zoom through the shared tabs adapter', async () => {
  await expect(resetTabZoom(4)).resolves.toBeUndefined();
  expect(browserTabsMock.setZoom).toHaveBeenCalledWith(4, 1);
});

it('rethrows clear/reset failures after logging them', async () => {
  const clearError = new Error('clear failed');
  const zoomError = new Error('zoom failed');

  browserDebuggerMock.sendCommand.mockRejectedValueOnce(clearError);
  browserTabsMock.setZoom.mockRejectedValueOnce(zoomError);

  await expect(clearViewportOverride(5)).rejects.toThrow('clear failed');
  await expect(resetTabZoom(4)).rejects.toThrow('zoom failed');
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to clear viewport', clearError);
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to reset zoom', zoomError);
});
