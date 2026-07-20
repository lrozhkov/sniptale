import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserDebuggerSendCommandMock,
  browserTabsCaptureVisibleTabMock,
  browserTabsGetMock,
  browserTabsQueryMock,
  createCaptureJobMock,
  loadSettingsMock,
  loggerWarnMock,
  resolveVisibleCaptureApiFormatMock,
  transitionCaptureJobMock,
  withHiddenFixedElementsMock,
} = vi.hoisted(() => ({
  browserDebuggerSendCommandMock: vi.fn(),
  browserTabsCaptureVisibleTabMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  createCaptureJobMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resolveVisibleCaptureApiFormatMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
  withHiddenFixedElementsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/debugger')>()),
  browserDebugger: { sendCommand: browserDebuggerSendCommandMock },
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    captureVisibleTab: browserTabsCaptureVisibleTabMock,
    get: browserTabsGetMock,
    query: browserTabsQueryMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), log: vi.fn(), warn: loggerWarnMock }),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/state-machine')>()),
  createCaptureJob: createCaptureJobMock,
  transitionCaptureJob: transitionCaptureJobMock,
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  resolveVisibleCaptureApiFormat: resolveVisibleCaptureApiFormatMock,
  withHiddenFixedElements: withHiddenFixedElementsMock,
}));

import { captureVisibleTabTransaction } from './flow';

beforeEach(() => {
  vi.clearAllMocks();
  createCaptureJobMock.mockResolvedValue({ jobId: 'capture-job-1' });
  loadSettingsMock.mockResolvedValue({ imageFormat: 'png', imageQuality: 90 });
  resolveVisibleCaptureApiFormatMock.mockReturnValue('png');
  transitionCaptureJobMock.mockResolvedValue(undefined);
  withHiddenFixedElementsMock.mockImplementation(async (_tabId, runCapture) => ({
    hiddenCount: 0,
    result: await runCapture(),
  }));
});

it('marks non-error visible capture failures with the route fallback message', async () => {
  browserTabsGetMock.mockRejectedValueOnce('tab unavailable');
  transitionCaptureJobMock
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('failed transition update'));

  await expect(captureVisibleTabTransaction(41)).rejects.toBe('tab unavailable');

  expect(transitionCaptureJobMock).toHaveBeenLastCalledWith('capture-job-1', 'failed', {
    error: 'Visible capture failed',
  });
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to mark visible capture job as failed',
    expect.any(Error)
  );
});

it('does not start debugger fallback for missing native visible capture authority', async () => {
  const captureError = new Error("Either the '<all_urls>' or 'activeTab' permission is required.");
  browserTabsGetMock.mockResolvedValue({ id: 42, windowId: 4 });
  browserTabsQueryMock.mockResolvedValue([{ id: 42, windowId: 4 }]);
  browserTabsCaptureVisibleTabMock.mockRejectedValue(captureError);

  await expect(captureVisibleTabTransaction(42)).rejects.toBe(captureError);

  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
  expect(transitionCaptureJobMock).toHaveBeenLastCalledWith('capture-job-1', 'failed', {
    error: "Either the '<all_urls>' or 'activeTab' permission is required.",
  });
});

it('fails closed before native capture when the authorized tab is no longer active', async () => {
  browserTabsGetMock.mockResolvedValue({ id: 43, windowId: 4 });
  browserTabsQueryMock.mockResolvedValue([{ id: 99, windowId: 4 }]);

  await expect(captureVisibleTabTransaction(43)).rejects.toThrow(
    'Visible capture target is not the active tab.'
  );

  expect(browserTabsCaptureVisibleTabMock).not.toHaveBeenCalled();
  expect(browserDebuggerSendCommandMock).not.toHaveBeenCalled();
  expect(transitionCaptureJobMock).toHaveBeenLastCalledWith('capture-job-1', 'failed', {
    error: 'Visible capture target is not the active tab.',
  });
});
