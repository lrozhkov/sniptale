import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLayoutMetrics, getAvailableWorkspace } from './metrics';
import { DEBUGGER_BANNER_HEIGHT } from '../constants';
import { DEFAULT_WORKSPACE_SIZE } from './helpers';

const {
  browserDebuggerMock,
  browserTabsMock,
  browserWindowsMock,
  loggerWarnMock,
  withTimeoutMock,
} = vi.hoisted(() => ({
  browserDebuggerMock: {
    sendCommand: vi.fn(),
  },
  browserTabsMock: {
    get: vi.fn(),
  },
  browserWindowsMock: {
    get: vi.fn(),
  },
  loggerWarnMock: vi.fn(),
  withTimeoutMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/debugger')>()),
  browserDebugger: browserDebuggerMock,
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: browserTabsMock,
}));

vi.mock('@sniptale/platform/browser/windows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/windows')>()),
  browserWindows: browserWindowsMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: loggerWarnMock,
  }),
}));

vi.mock('../infra', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infra')>()),
  withTimeout: withTimeoutMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  withTimeoutMock.mockImplementation((promise: Promise<unknown>) => promise);
  browserTabsMock.get.mockResolvedValue({ windowId: 3 });
  browserWindowsMock.get.mockResolvedValue({ width: 1600, height: 1000 });
});

function registerLayoutMetricTests() {
  it('fetches layout metrics through the timeout wrapper', async () => {
    const layoutMetrics = { visualViewport: { clientWidth: 1200, clientHeight: 900 } };
    browserDebuggerMock.sendCommand.mockResolvedValue(layoutMetrics);

    await expect(fetchLayoutMetrics(9)).resolves.toEqual(layoutMetrics);
    expect(browserDebuggerMock.sendCommand).toHaveBeenCalledWith(
      { tabId: 9 },
      'Page.getLayoutMetrics'
    );
  });

  it('resolves workspace from CDP layout metrics when available', async () => {
    browserDebuggerMock.sendCommand.mockResolvedValue({
      visualViewport: { clientWidth: 1400, clientHeight: 900 },
    });

    await expect(getAvailableWorkspace(9)).resolves.toEqual({
      width: 1400,
      height: 900 - DEBUGGER_BANNER_HEIGHT,
    });
    expect(browserTabsMock.get).not.toHaveBeenCalled();
  });
}

function registerWorkspaceFallbackTests() {
  it('falls back to the window API when CDP layout metrics are unavailable', async () => {
    browserDebuggerMock.sendCommand.mockRejectedValue(new Error('cdp unavailable'));

    await expect(getAvailableWorkspace(11)).resolves.toEqual({
      width: 1600,
      height: 1000 - DEBUGGER_BANNER_HEIGHT,
    });
    expect(browserTabsMock.get).toHaveBeenCalledWith(11);
    expect(browserWindowsMock.get).toHaveBeenCalledWith(3);
  });

  it('uses default dimensions when the fallback window omits them', async () => {
    browserDebuggerMock.sendCommand.mockRejectedValue(new Error('cdp unavailable'));
    browserWindowsMock.get.mockResolvedValue({});

    await expect(getAvailableWorkspace(12)).resolves.toEqual({
      width: DEFAULT_WORKSPACE_SIZE.width,
      height: DEFAULT_WORKSPACE_SIZE.height - DEBUGGER_BANNER_HEIGHT,
    });
  });

  it('uses the default workspace when the fallback tab has no window id', async () => {
    browserDebuggerMock.sendCommand.mockRejectedValue(new Error('cdp unavailable'));
    browserTabsMock.get.mockResolvedValue({ windowId: undefined });

    await expect(getAvailableWorkspace(13)).resolves.toEqual(DEFAULT_WORKSPACE_SIZE);
  });

  it('uses the default workspace when the fallback window lookup fails', async () => {
    browserDebuggerMock.sendCommand.mockRejectedValue(new Error('cdp unavailable'));
    browserWindowsMock.get.mockRejectedValue(new Error('window unavailable'));

    await expect(getAvailableWorkspace(15)).resolves.toEqual(DEFAULT_WORKSPACE_SIZE);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'Failed to get workspace, using default workspace',
      expect.any(Error)
    );
  });
}

describe('debugger-workspace-metrics layout resolution', () => {
  registerLayoutMetricTests();
  registerWorkspaceFallbackTests();
});
