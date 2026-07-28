import { beforeEach, expect, it, vi } from 'vitest';
import { clearViewportOverride, overrideDeviceMetrics } from './commands';

const { browserDebuggerMock, loggerErrorMock, withTimeoutMock } = vi.hoisted(() => ({
  browserDebuggerMock: { sendCommand: vi.fn() },
  loggerErrorMock: vi.fn(),
  withTimeoutMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({ browserDebugger: browserDebuggerMock }));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: loggerErrorMock }),
}));
vi.mock('../infra', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infra')>()),
  withTimeout: withTimeoutMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  withTimeoutMock.mockImplementation((promise: Promise<unknown>) => promise);
});

it('pins the visible compositor area to the exact CSS viewport', async () => {
  await overrideDeviceMetrics(9, 1280, 720, 2);

  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledWith(
    { tabId: 9 },
    'Emulation.setDeviceMetricsOverride',
    {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1280,
      screenHeight: 720,
      positionX: 0,
      positionY: 0,
      scrollbarType: 'overlay',
      viewport: { x: 0, y: 0, width: 1280, height: 720, scale: 2 },
    }
  );
});

it('clears the exact viewport override', async () => {
  await clearViewportOverride(5);
  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledWith(
    { tabId: 5 },
    'Emulation.clearDeviceMetricsOverride'
  );
});

it('surfaces clear failures', async () => {
  const error = new Error('clear failed');
  browserDebuggerMock.sendCommand.mockRejectedValueOnce(error);
  await expect(clearViewportOverride(5)).rejects.toThrow('clear failed');
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to clear viewport', error);
});
