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

beforeEach(() => {
  vi.clearAllMocks();
  browserDebuggerMock.sendCommand.mockReset();
  executeScriptMock.mockReset();
  withTimeoutMock.mockImplementation((promise: Promise<unknown>) => promise);
});

it('applies and verifies exact viewport metrics', async () => {
  browserDebuggerMock.sendCommand.mockResolvedValueOnce(undefined);
  executeScriptMock
    .mockResolvedValueOnce([{ result: undefined }])
    .mockResolvedValueOnce([{ result: { width: 1280, height: 720 } }]);

  await expect(setViewport(9, 1280, 720)).resolves.toEqual({
    cssWidth: 1280,
    cssHeight: 720,
  });
  expect(browserDebuggerMock.sendCommand).toHaveBeenNthCalledWith(
    1,
    { tabId: 9 },
    'Emulation.setDeviceMetricsOverride',
    expect.objectContaining({ deviceScaleFactor: 1 })
  );
});

it('verifies isolated window metrics instead of page-controlled or scrollbar-excluding values', async () => {
  browserDebuggerMock.sendCommand.mockResolvedValueOnce(undefined);
  executeScriptMock
    .mockResolvedValueOnce([{ result: undefined }])
    .mockResolvedValueOnce([{ result: { width: 1280, height: 720 } }]);

  await expect(setViewport(9, 1280, 720)).resolves.toEqual({
    cssWidth: 1280,
    cssHeight: 720,
  });
  expect(executeScriptMock).toHaveBeenCalledWith(
    expect.objectContaining({ target: { tabId: 9 }, world: 'ISOLATED' })
  );
});

it('reports the owned intermediate on mismatch and leaves rollback to the surface owner', async () => {
  browserDebuggerMock.sendCommand.mockResolvedValueOnce(undefined);
  executeScriptMock
    .mockResolvedValueOnce([{ result: undefined }])
    .mockResolvedValueOnce([{ result: { width: 1000, height: 700 } }]);
  const error = await setViewport(9, 1280, 720).catch((caught) => caught);
  expect(error).toBeInstanceOf(ViewportMutationError);
  expect(error).toMatchObject({ observed: { cssWidth: 1000, cssHeight: 700 } });
  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledOnce();
});

it('rejects missing isolated metrics without independently clearing owner state', async () => {
  browserDebuggerMock.sendCommand.mockResolvedValueOnce(undefined);
  executeScriptMock.mockResolvedValueOnce([{ result: undefined }]).mockResolvedValueOnce([]);

  await expect(setViewport(9, 1280, 720)).rejects.toThrow('window.innerWidth');
  expect(browserDebuggerMock.sendCommand).toHaveBeenCalledOnce();
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
