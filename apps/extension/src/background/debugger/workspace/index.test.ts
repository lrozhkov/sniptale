import { beforeEach, expect, it, vi } from 'vitest';

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
  createLogger: () => ({ debug: vi.fn(), error: vi.fn() }),
}));
vi.mock('../infra', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infra')>()),
  withTimeout: withTimeoutMock,
}));

import { clearViewport, getViewportWorkspace, setViewport, ViewportMutationError } from './index';

function compositorMetrics(scale: number, width = 1280, height = 720) {
  return {
    layoutViewport: {
      clientWidth: Math.round(width * scale),
      clientHeight: Math.round(height * scale),
    },
    cssLayoutViewport: { clientWidth: width, clientHeight: height },
    cssVisualViewport: { zoom: 1 },
  };
}

function queuePaint(width = 1280, height = 720): void {
  executeScriptMock
    .mockResolvedValueOnce([{ result: undefined }])
    .mockResolvedValueOnce([{ result: { width, height } }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  browserDebuggerMock.sendCommand.mockReset();
  executeScriptMock.mockReset();
  withTimeoutMock.mockImplementation((promise: Promise<unknown>) => promise);
});

it('applies and verifies exact viewport metrics', async () => {
  browserDebuggerMock.sendCommand
    .mockResolvedValueOnce(compositorMetrics(2))
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(compositorMetrics(2));
  queuePaint();

  await expect(setViewport(9, 1280, 720)).resolves.toEqual({
    cssWidth: 1280,
    cssHeight: 720,
  });
  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    1,
    { tabId: 9 },
    'Page.getLayoutMetrics'
  );
  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    2,
    { tabId: 9 },
    'Emulation.setDeviceMetricsOverride',
    expect.objectContaining({
      deviceScaleFactor: 1,
      viewport: expect.objectContaining({ scale: 2 }),
    })
  );
  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    3,
    { tabId: 9 },
    'Page.getLayoutMetrics'
  );
});

it('verifies isolated window metrics instead of page-controlled or scrollbar-excluding values', async () => {
  browserDebuggerMock.sendCommand
    .mockResolvedValueOnce(compositorMetrics(1))
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(compositorMetrics(1));
  queuePaint();

  await expect(setViewport(9, 1280, 720)).resolves.toEqual({
    cssWidth: 1280,
    cssHeight: 720,
  });
  expect(executeScriptMock).toHaveBeenCalledWith(
    expect.objectContaining({ target: { tabId: 9 }, world: 'ISOLATED' })
  );
});

it('reports the owned intermediate on mismatch and leaves rollback to the surface owner', async () => {
  browserDebuggerMock.sendCommand
    .mockResolvedValueOnce(compositorMetrics(1))
    .mockResolvedValueOnce(undefined);
  executeScriptMock
    .mockResolvedValueOnce([{ result: undefined }])
    .mockResolvedValueOnce([{ result: { width: 1000, height: 700 } }]);
  const error = await setViewport(9, 1280, 720).catch((caught) => caught);
  expect(error).toBeInstanceOf(ViewportMutationError);
  expect(error).toMatchObject({ observed: { cssWidth: 1000, cssHeight: 700 } });
  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledTimes(2);
});

it('rejects missing isolated metrics without independently clearing owner state', async () => {
  browserDebuggerMock.sendCommand
    .mockResolvedValueOnce(compositorMetrics(1))
    .mockResolvedValueOnce(undefined);
  executeScriptMock.mockResolvedValueOnce([{ result: undefined }]).mockResolvedValueOnce([]);

  await expect(setViewport(9, 1280, 720)).rejects.toThrow('window.innerWidth');
  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledTimes(2);
});

it('fails before mutation when initial compositor metrics are malformed', async () => {
  browserDebuggerMock.sendCommand.mockResolvedValueOnce({});

  await expect(setViewport(9, 1280, 720)).rejects.toThrow('compositor metrics');
  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledOnce();
  expect(executeScriptMock).not.toHaveBeenCalled();
});

it('reapplies once when the tab moves to a differently scaled display during paint', async () => {
  browserDebuggerMock.sendCommand
    .mockResolvedValueOnce(compositorMetrics(1.25))
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(compositorMetrics(1.5))
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(compositorMetrics(1.5));
  queuePaint();
  queuePaint();

  await expect(setViewport(9, 1280, 720)).resolves.toEqual({
    cssWidth: 1280,
    cssHeight: 720,
  });
  const overrideCalls = browserDebuggerMock.sendCommand.mock.calls.filter(
    ([, method]) => method === 'Emulation.setDeviceMetricsOverride'
  );
  expect(overrideCalls).toHaveLength(2);
  expect(overrideCalls[0]?.[2]).toEqual(
    expect.objectContaining({ viewport: expect.objectContaining({ scale: 1.25 }) })
  );
  expect(overrideCalls[1]?.[2]).toEqual(
    expect.objectContaining({ viewport: expect.objectContaining({ scale: 1.5 }) })
  );
});

it('reports owned viewport state when compositor scale keeps changing', async () => {
  browserDebuggerMock.sendCommand
    .mockResolvedValueOnce(compositorMetrics(1.25))
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(compositorMetrics(1.5))
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(compositorMetrics(2));
  queuePaint();
  queuePaint();

  const error = await setViewport(9, 1280, 720).catch((caught) => caught);
  expect(error).toBeInstanceOf(ViewportMutationError);
  expect(error).toMatchObject({ observed: { cssWidth: 1280, cssHeight: 720 } });
});

it('reports owned viewport state when post-mutation compositor metrics are malformed', async () => {
  browserDebuggerMock.sendCommand
    .mockResolvedValueOnce(compositorMetrics(1))
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({});
  queuePaint();

  const error = await setViewport(9, 1280, 720).catch((caught) => caught);
  expect(error).toBeInstanceOf(ViewportMutationError);
  expect(error).toMatchObject({ observed: { cssWidth: 1280, cssHeight: 720 } });
});

it('reads and clears the exact workspace', async () => {
  executeScriptMock.mockResolvedValueOnce([{ result: { width: 1440, height: 900 } }]);
  await expect(getViewportWorkspace(4)).resolves.toEqual({ width: 1440, height: 900 });
  browserDebuggerMock.sendCommand.mockResolvedValueOnce(undefined);
  await expect(clearViewport(4)).resolves.toBeUndefined();
  expect(browserDebuggerMock.sendCommand).toHaveBeenLastCalledWith(
    { tabId: 4 },
    'Emulation.clearDeviceMetricsOverride'
  );
});
