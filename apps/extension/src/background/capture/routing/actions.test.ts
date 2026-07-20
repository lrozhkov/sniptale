import { beforeEach, expect, it, vi } from 'vitest';

const {
  executeDownloadMock,
  createRenderedCaptureJobMock,
  isExportHarStartPreauthorizedMock,
  isExportHarStopPreauthorizedMock,
  startPreauthorizedExportHarSessionMock,
  stopPreauthorizedExportHarSessionMock,
  transitionCaptureJobMock,
} = vi.hoisted(() => ({
  executeDownloadMock: vi.fn(),
  createRenderedCaptureJobMock: vi.fn(),
  isExportHarStartPreauthorizedMock: vi.fn(),
  isExportHarStopPreauthorizedMock: vi.fn(),
  startPreauthorizedExportHarSessionMock: vi.fn(),
  stopPreauthorizedExportHarSessionMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
}));

vi.mock('../download/download-router/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download/download-router/index')>()),
  executeDownload: executeDownloadMock,
}));

vi.mock('../jobs/rendered-job', () => ({
  createRenderedCaptureJob: createRenderedCaptureJobMock,
}));

vi.mock('../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/state-machine')>()),
  transitionCaptureJob: transitionCaptureJobMock,
}));

vi.mock('../../diagnostics/public/har-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../diagnostics/public/har-export')>()),
  isExportHarStartPreauthorized: isExportHarStartPreauthorizedMock,
  isExportHarStopPreauthorized: isExportHarStopPreauthorizedMock,
  startPreauthorizedExportHarSession: startPreauthorizedExportHarSessionMock,
  stopPreauthorizedExportHarSession: stopPreauthorizedExportHarSessionMock,
}));

import { handleExecuteSave, handleExportStartHar, handleExportStopHar } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  executeDownloadMock.mockResolvedValue(undefined);
  createRenderedCaptureJobMock.mockResolvedValue('capture-job-route');
  transitionCaptureJobMock.mockResolvedValue(undefined);
  isExportHarStartPreauthorizedMock.mockReturnValue(true);
  isExportHarStopPreauthorizedMock.mockReturnValue(true);
  startPreauthorizedExportHarSessionMock.mockResolvedValue({
    capabilityToken: 'har-token',
    expiresAtEpochMs: 123,
  });
  stopPreauthorizedExportHarSessionMock.mockResolvedValue({
    har: { id: 'har-1' },
    rawDiagnosticsEnabled: false,
  });
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

it('executes save downloads', async () => {
  const sendResponse = vi.fn();

  expect(
    handleExecuteSave(
      {
        dataUrl: 'data:image/png;base64,1',
        filename: 'capture.png',
        actionType: 'download_default',
      },
      42,
      sendResponse
    )
  ).toBe(true);
  await flushPromises();

  expect(executeDownloadMock).toHaveBeenCalledWith(
    'data:image/png;base64,1',
    'capture.png',
    'download_default',
    undefined,
    'capture-job-route'
  );
});

it('validates HAR start and stop authority', () => {
  const sendResponse = vi.fn();

  expect(handleExportStartHar({}, 42, sendResponse)).toBe(true);
  expect(sendResponse).toHaveBeenCalled();

  isExportHarStopPreauthorizedMock.mockReturnValueOnce(false);
  expect(handleExportStopHar({ sessionId: 'har-1' }, 42, sendResponse)).toBe(true);
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'Missing HAR capability token',
    success: false,
  });

  expect(
    handleExportStopHar({ capabilityToken: 'har-token', sessionId: 'har-1' }, 42, sendResponse)
  ).toBe(true);
  expect(stopPreauthorizedExportHarSessionMock).toHaveBeenCalledWith(
    { capabilityToken: 'har-token', sessionId: 'har-1' },
    'har-1',
    42,
    'har-token'
  );
});
