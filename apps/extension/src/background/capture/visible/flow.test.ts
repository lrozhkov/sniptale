import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserTabsCaptureVisibleTabMock,
  browserTabsGetMock,
  browserTabsQueryMock,
  finalizeCapturedDataUrlMock,
  loadSettingsMock,
  loggerDebugMock,
  loggerLogMock,
  loggerWarnMock,
  resolveVisibleCaptureApiFormatMock,
  createCaptureJobMock,
  transitionCaptureJobMock,
  withHiddenFixedElementsMock,
} = vi.hoisted(() => ({
  browserTabsCaptureVisibleTabMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  finalizeCapturedDataUrlMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerLogMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resolveVisibleCaptureApiFormatMock: vi.fn(),
  createCaptureJobMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
  withHiddenFixedElementsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    captureVisibleTab: browserTabsCaptureVisibleTabMock,
    get: browserTabsGetMock,
    query: browserTabsQueryMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
    log: loggerLogMock,
    warn: loggerWarnMock,
  }),
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

vi.mock('./helpers', () => ({
  finalizeCapturedDataUrl: finalizeCapturedDataUrlMock,
  resolveVisibleCaptureApiFormat: resolveVisibleCaptureApiFormatMock,
  withHiddenFixedElements: withHiddenFixedElementsMock,
}));

import { captureVisibleTab, captureVisibleTabForCrop, captureVisibleTabTransaction } from './flow';
import { resetNativeVisibleCaptureCoordinatorForTests } from './coordinator';

function resetVisibleFlowMocks() {
  vi.clearAllMocks();
  withHiddenFixedElementsMock.mockImplementation(async (_tabId, runCapture) => ({
    hiddenCount: 2,
    result: await runCapture(),
  }));
  createCaptureJobMock.mockResolvedValue({ jobId: 'capture-job-1' });
  transitionCaptureJobMock.mockResolvedValue(undefined);
}

function useVisibleFlowTestScope() {
  beforeEach(() => {
    resetVisibleFlowMocks();
    resetNativeVisibleCaptureCoordinatorForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}

describe('capture-visible-flow native visible capture', () => {
  useVisibleFlowTestScope();

  it('captures the visible tab through the tabs adapter and masking wrapper', async () => {
    loadSettingsMock.mockResolvedValue({ imageFormat: 'jpeg', imageQuality: 82 });
    resolveVisibleCaptureApiFormatMock.mockReturnValue('jpeg');
    browserTabsGetMock.mockResolvedValue({ id: 11, windowId: 5 });
    browserTabsQueryMock.mockResolvedValue([{ id: 11, windowId: 5 }]);
    browserTabsCaptureVisibleTabMock.mockResolvedValue('data:image/jpeg;base64,raw');
    finalizeCapturedDataUrlMock.mockResolvedValue('data:image/jpeg;base64,final');

    await expect(captureVisibleTab(11)).resolves.toBe('data:image/jpeg;base64,final');

    expect(createCaptureJobMock).toHaveBeenCalledWith(11);
    expect(transitionCaptureJobMock).toHaveBeenNthCalledWith(1, 'capture-job-1', 'capturing');
    expect(transitionCaptureJobMock).toHaveBeenNthCalledWith(2, 'capture-job-1', 'rendering');
    expect(transitionCaptureJobMock).toHaveBeenNthCalledWith(3, 'capture-job-1', 'completed');
    expect(browserTabsGetMock).toHaveBeenCalledWith(11);
    expect(browserTabsQueryMock).toHaveBeenCalledWith({ active: true, windowId: 5 });
    expect(withHiddenFixedElementsMock).toHaveBeenCalledWith(11, expect.any(Function));
    expect(finalizeCapturedDataUrlMock).toHaveBeenCalledWith({
      dataUrl: 'data:image/jpeg;base64,raw',
      settings: { imageFormat: 'jpeg', imageQuality: 82 },
      convertPngToWebp: expect.any(Function),
    });
  });

  it('revalidates the active tab before a quota retry can capture new pixels', async () => {
    vi.useFakeTimers();
    loadSettingsMock.mockResolvedValue({ imageFormat: 'png', imageQuality: 90 });
    resolveVisibleCaptureApiFormatMock.mockReturnValue('png');
    browserTabsGetMock.mockResolvedValue({ id: 11, windowId: 5 });
    browserTabsQueryMock
      .mockResolvedValueOnce([{ id: 11, windowId: 5 }])
      .mockResolvedValueOnce([{ id: 11, windowId: 5 }])
      .mockResolvedValueOnce([{ id: 12, windowId: 5 }]);
    browserTabsCaptureVisibleTabMock.mockRejectedValueOnce(
      new Error('This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.')
    );

    const capture = expect(captureVisibleTab(11)).rejects.toThrow(
      'Visible capture target is not the active tab'
    );
    await vi.advanceTimersByTimeAsync(1_100);

    await capture;
    expect(browserTabsCaptureVisibleTabMock).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('capture-visible-flow transactions', () => {
  useVisibleFlowTestScope();

  it('returns capture job identity for delivery-owned visible captures', async () => {
    loadSettingsMock.mockResolvedValue({ imageFormat: 'png', imageQuality: 90 });
    resolveVisibleCaptureApiFormatMock.mockReturnValue('png');
    browserTabsGetMock.mockResolvedValue({ id: 18, windowId: 4 });
    browserTabsQueryMock.mockResolvedValue([{ id: 18, windowId: 4 }]);
    browserTabsCaptureVisibleTabMock.mockResolvedValue('data:image/png;base64,raw');
    finalizeCapturedDataUrlMock.mockResolvedValue('data:image/png;base64,final');

    await expect(captureVisibleTabTransaction(18)).resolves.toEqual({
      dataUrl: 'data:image/png;base64,final',
      jobId: 'capture-job-1',
    });

    expect(transitionCaptureJobMock).toHaveBeenCalledTimes(2);
    expect(transitionCaptureJobMock).not.toHaveBeenCalledWith('capture-job-1', 'completed');
  });

  it('completes direct crop captures after the visible transaction returns', async () => {
    loadSettingsMock.mockResolvedValue({ imageFormat: 'png', imageQuality: 90 });
    resolveVisibleCaptureApiFormatMock.mockReturnValue('png');
    browserTabsGetMock.mockResolvedValue({ id: 19, windowId: 6 });
    browserTabsQueryMock.mockResolvedValue([{ id: 19, windowId: 6 }]);
    browserTabsCaptureVisibleTabMock.mockResolvedValue('data:image/png;base64,raw');
    finalizeCapturedDataUrlMock.mockResolvedValue('data:image/png;base64,crop');

    await expect(captureVisibleTabForCrop(19)).resolves.toBe('data:image/png;base64,crop');

    expect(transitionCaptureJobMock).toHaveBeenLastCalledWith('capture-job-1', 'completed');
  });
});
