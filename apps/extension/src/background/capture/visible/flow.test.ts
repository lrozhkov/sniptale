import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserDebuggerSendCommandMock,
  browserTabsCaptureVisibleTabMock,
  browserTabsGetMock,
  browserTabsQueryMock,
  buildViewportCaptureScreenshotOptionsMock,
  createDebuggerCaptureDataUrlMock,
  finalizeCapturedDataUrlMock,
  loadSettingsMock,
  loggerDebugMock,
  loggerLogMock,
  loggerWarnMock,
  parseCaptureScreenshotResultMock,
  resolveVisibleCaptureApiFormatMock,
  createCaptureJobMock,
  transitionCaptureJobMock,
  withHiddenFixedElementsMock,
} = vi.hoisted(() => ({
  browserDebuggerSendCommandMock: vi.fn(),
  browserTabsCaptureVisibleTabMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  buildViewportCaptureScreenshotOptionsMock: vi.fn(),
  createDebuggerCaptureDataUrlMock: vi.fn(),
  finalizeCapturedDataUrlMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerLogMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  parseCaptureScreenshotResultMock: vi.fn(),
  resolveVisibleCaptureApiFormatMock: vi.fn(),
  createCaptureJobMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
  withHiddenFixedElementsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/debugger')>()),
  browserDebugger: {
    sendCommand: browserDebuggerSendCommandMock,
  },
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

vi.mock('../full-page/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../full-page/helpers')>()),
  parseCaptureScreenshotResult: parseCaptureScreenshotResultMock,
}));

vi.mock('../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/state-machine')>()),
  createCaptureJob: createCaptureJobMock,
  transitionCaptureJob: transitionCaptureJobMock,
}));

vi.mock('./helpers', () => ({
  buildViewportCaptureScreenshotOptions: buildViewportCaptureScreenshotOptionsMock,
  createDebuggerCaptureDataUrl: createDebuggerCaptureDataUrlMock,
  finalizeCapturedDataUrl: finalizeCapturedDataUrlMock,
  resolveVisibleCaptureApiFormat: resolveVisibleCaptureApiFormatMock,
  withHiddenFixedElements: withHiddenFixedElementsMock,
}));

import {
  captureViewportWithClip,
  captureViewportWithClipTransaction,
  captureVisibleTab,
  captureVisibleTabForCrop,
  captureVisibleTabTransaction,
} from './flow';

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

describe('capture-visible-flow viewport capture', () => {
  useVisibleFlowTestScope();

  it('captures a viewport through the debugger adapter and post-processes the result', async () => {
    loadSettingsMock.mockResolvedValue({ imageFormat: 'png', imageQuality: 90 });
    buildViewportCaptureScreenshotOptionsMock.mockReturnValue({ clip: { width: 1280 } });
    browserDebuggerSendCommandMock.mockResolvedValue({ data: 'raw-screenshot' });
    parseCaptureScreenshotResultMock.mockReturnValue({ data: 'parsed-screenshot' });
    createDebuggerCaptureDataUrlMock.mockReturnValue('data:image/png;base64,parsed');
    finalizeCapturedDataUrlMock.mockResolvedValue('data:image/png;base64,final');

    await expect(captureViewportWithClip(25, { width: 1280, height: 720 })).resolves.toBe(
      'data:image/png;base64,final'
    );

    expect(createCaptureJobMock).toHaveBeenCalledWith(25);
    expect(browserDebuggerSendCommandMock).toHaveBeenCalledWith(
      { tabId: 25 },
      'Page.captureScreenshot',
      { clip: { width: 1280 } }
    );
    expect(parseCaptureScreenshotResultMock).toHaveBeenCalledWith({ data: 'raw-screenshot' });
    expect(createDebuggerCaptureDataUrlMock).toHaveBeenCalledWith('parsed-screenshot', 'png');
  });
});

describe('capture-visible-flow viewport capture failure handling', () => {
  useVisibleFlowTestScope();

  it('propagates viewport parsing failures', async () => {
    const parseError = new Error('invalid screenshot payload');

    loadSettingsMock.mockResolvedValue({ imageFormat: 'png', imageQuality: 50 });
    buildViewportCaptureScreenshotOptionsMock.mockReturnValue({ clip: { width: 640 } });
    browserDebuggerSendCommandMock.mockResolvedValue({ invalid: true });
    parseCaptureScreenshotResultMock.mockImplementation(() => {
      throw parseError;
    });

    await expect(captureViewportWithClip(33, { width: 640, height: 360 })).rejects.toBe(parseError);
    expect(transitionCaptureJobMock).toHaveBeenLastCalledWith('capture-job-1', 'failed', {
      error: 'invalid screenshot payload',
    });
    expect(createDebuggerCaptureDataUrlMock).not.toHaveBeenCalled();
  });
});

describe('capture-visible-flow viewport transaction payloads', () => {
  useVisibleFlowTestScope();

  it('returns capture job identity for delivery-owned viewport captures', async () => {
    loadSettingsMock.mockResolvedValue({ imageFormat: 'png', imageQuality: 90 });
    buildViewportCaptureScreenshotOptionsMock.mockReturnValue({ clip: { width: 1440 } });
    browserDebuggerSendCommandMock.mockResolvedValue({ data: 'raw-screenshot' });
    parseCaptureScreenshotResultMock.mockReturnValue({ data: 'parsed-screenshot' });
    createDebuggerCaptureDataUrlMock.mockReturnValue('data:image/png;base64,parsed');
    finalizeCapturedDataUrlMock.mockResolvedValue('data:image/png;base64,viewport');

    await expect(
      captureViewportWithClipTransaction(29, { width: 1440, height: 900 })
    ).resolves.toEqual({
      dataUrl: 'data:image/png;base64,viewport',
      jobId: 'capture-job-1',
    });

    expect(transitionCaptureJobMock).toHaveBeenCalledTimes(2);
    expect(transitionCaptureJobMock).not.toHaveBeenCalledWith('capture-job-1', 'completed');
  });
});
