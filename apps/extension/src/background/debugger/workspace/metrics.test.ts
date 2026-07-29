import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  readIsolatedViewportMetrics,
  readViewportCompositorScale,
  waitForIsolatedViewportPaint,
} from './metrics';

const { browserDebuggerMock, executeScriptMock, withTimeoutMock } = vi.hoisted(() => ({
  browserDebuggerMock: { sendCommand: vi.fn() },
  executeScriptMock: vi.fn(),
  withTimeoutMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({ browserDebugger: browserDebuggerMock }));
vi.mock('@sniptale/platform/browser/scripting', () => ({
  browserScripting: { executeScript: executeScriptMock },
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn() }),
}));
vi.mock('../infra', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infra')>()),
  withTimeout: withTimeoutMock,
}));
beforeEach(() => {
  vi.clearAllMocks();
  withTimeoutMock.mockImplementation((promise: Promise<unknown>) => promise);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('reads exact window viewport metrics in an explicit isolated world', async () => {
  executeScriptMock.mockResolvedValue([{ result: { width: 1200, height: 900 } }]);
  await expect(readIsolatedViewportMetrics(9)).resolves.toEqual({
    cssWidth: 1200,
    cssHeight: 900,
  });
  expect(executeScriptMock).toHaveBeenCalledWith({
    target: { tabId: 9 },
    world: 'ISOLATED',
    func: expect.any(Function),
  });
});

it('fails closed when exact workspace metrics are missing', async () => {
  executeScriptMock.mockResolvedValue([]);
  await expect(readIsolatedViewportMetrics(9)).rejects.toThrow('window.innerWidth');
});

it('reads the live isolated-world viewport inside the injected function', async () => {
  vi.stubGlobal('window', { innerWidth: 1365, innerHeight: 767 });
  executeScriptMock.mockImplementationOnce(
    async (options: { func: () => { width: number; height: number } }) => [
      { result: options.func() },
    ]
  );

  await expect(readIsolatedViewportMetrics(9)).resolves.toEqual({
    cssWidth: 1365,
    cssHeight: 767,
  });
});

it('reads and parses the live compositor scale through the debugger boundary', async () => {
  browserDebuggerMock.sendCommand.mockResolvedValue({
    layoutViewport: { clientWidth: 800, clientHeight: 600 },
    cssLayoutViewport: { clientWidth: 400, clientHeight: 300 },
    cssVisualViewport: { zoom: 1 },
  });

  await expect(readViewportCompositorScale(9)).resolves.toBe(2);
  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledWith(
    { tabId: 9 },
    'Page.getLayoutMetrics'
  );
});

it('fails closed when debugger compositor metrics are malformed', async () => {
  browserDebuggerMock.sendCommand.mockResolvedValue({});
  await expect(readViewportCompositorScale(9)).rejects.toThrow('compositor metrics');
});

it('waits for two isolated animation frames before capture continues', async () => {
  const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
  executeScriptMock.mockImplementationOnce(async (options: { func: () => Promise<void> }) => [
    { result: await options.func() },
  ]);

  await waitForIsolatedViewportPaint(9);
  expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);
  expect(executeScriptMock).toHaveBeenCalledWith({
    target: { tabId: 9 },
    world: 'ISOLATED',
    func: expect.any(Function),
  });
});
