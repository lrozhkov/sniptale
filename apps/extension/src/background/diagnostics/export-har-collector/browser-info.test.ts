import { beforeEach, expect, it, vi } from 'vitest';

const { browserDebuggerSendCommandMock, loggerWarnMock } = vi.hoisted(() => ({
  browserDebuggerSendCommandMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', () => ({
  browserDebugger: {
    sendCommand: browserDebuggerSendCommandMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

import { resolveHarBrowserInfo } from './browser-info';

beforeEach(() => {
  vi.clearAllMocks();
});

it('resolves browser metadata from Browser.getVersion', async () => {
  browserDebuggerSendCommandMock.mockResolvedValue({
    product: 'Chrome/123.0.0.0',
  });

  await expect(resolveHarBrowserInfo(17)).resolves.toEqual({
    browserName: 'Chrome',
    browserVersion: '123.0.0.0',
  });
  expect(browserDebuggerSendCommandMock).toHaveBeenCalledWith({ tabId: 17 }, 'Browser.getVersion');
});

it('falls back to Chromium metadata when Browser.getVersion fails', async () => {
  const error = new Error('version unavailable');
  browserDebuggerSendCommandMock.mockRejectedValue(error);

  await expect(resolveHarBrowserInfo(19)).resolves.toEqual({
    browserName: 'Chromium',
    browserVersion: '',
  });
  expect(loggerWarnMock).toHaveBeenCalledWith('Failed to resolve HAR browser metadata', error, {
    tabId: 19,
  });
});
