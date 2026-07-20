import { beforeEach, expect, it, vi } from 'vitest';

const {
  captureFullPageForArchiveMock,
  isExportHarStopPreauthorizedMock,
  issueExportHarStartCapabilityMock,
  stopPreauthorizedExportHarSessionMock,
} = vi.hoisted(() => ({
  captureFullPageForArchiveMock: vi.fn(),
  isExportHarStopPreauthorizedMock: vi.fn(),
  issueExportHarStartCapabilityMock: vi.fn(),
  stopPreauthorizedExportHarSessionMock: vi.fn(),
}));

vi.mock('../index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../index')>()),
  captureFullPageForArchive: captureFullPageForArchiveMock,
}));

vi.mock('../../diagnostics/public/har-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../diagnostics/public/har-export')>()),
  isExportHarStopPreauthorized: isExportHarStopPreauthorizedMock,
  issueExportHarStartCapability: issueExportHarStartCapabilityMock,
  stopPreauthorizedExportHarSession: stopPreauthorizedExportHarSessionMock,
}));

import {
  handleExportCaptureFullPage,
  handleRequestExportHarStartCapability,
  handleExportStopHar,
} from './actions.export';

beforeEach(() => {
  vi.clearAllMocks();
  captureFullPageForArchiveMock.mockResolvedValue('data:image/png;base64,7');
  isExportHarStopPreauthorizedMock.mockReturnValue(true);
  issueExportHarStartCapabilityMock.mockReturnValue('start-capability-token');
  stopPreauthorizedExportHarSessionMock.mockResolvedValue({
    har: { entries: [] },
    rawDiagnosticsEnabled: false,
  });
});

it('handles HAR start capability request validation and issuance', () => {
  const missingSessionResponse = vi.fn();
  const tabMismatchResponse = vi.fn();
  const successResponse = vi.fn();

  expect(handleRequestExportHarStartCapability({}, 42, undefined, missingSessionResponse)).toBe(
    true
  );
  expect(
    handleRequestExportHarStartCapability(
      { sessionId: 'har-1' },
      42,
      { tab: { id: 7 } as chrome.tabs.Tab },
      tabMismatchResponse
    )
  ).toBe(true);
  expect(
    handleRequestExportHarStartCapability(
      { sessionId: 'har-2' },
      42,
      { tab: { id: 42 } as chrome.tabs.Tab, url: 'chrome-extension://test/content.js' },
      successResponse
    )
  ).toBe(true);

  expect(missingSessionResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Missing HAR session id',
  });
  expect(tabMismatchResponse).toHaveBeenCalledWith({
    success: false,
    error: 'HAR capability sender tab mismatch',
  });
  expect(issueExportHarStartCapabilityMock).toHaveBeenCalledWith({
    rawDiagnosticsEnabled: false,
    senderUrl: 'chrome-extension://test/content.js',
    sessionId: 'har-2',
    tabId: 42,
  });
  expect(successResponse).toHaveBeenCalledWith({
    success: true,
    capabilityToken: 'start-capability-token',
  });
});

it('binds requested raw HAR mode to the issued start capability', () => {
  const successResponse = vi.fn();

  expect(
    handleRequestExportHarStartCapability(
      { rawDiagnosticsEnabled: true, sessionId: 'har-raw' },
      42,
      { tab: { id: 42 } as chrome.tabs.Tab, url: 'chrome-extension://test/content.js' },
      successResponse
    )
  ).toBe(true);

  expect(issueExportHarStartCapabilityMock).toHaveBeenCalledWith({
    rawDiagnosticsEnabled: true,
    senderUrl: 'chrome-extension://test/content.js',
    sessionId: 'har-raw',
    tabId: 42,
  });
});

it('returns a typed denial when HAR capability issuance is excluded by erasure', () => {
  const sendResponse = vi.fn();
  issueExportHarStartCapabilityMock.mockImplementationOnce(() => {
    throw new Error('HAR capability issuance rejected during local data erasure');
  });

  expect(
    handleRequestExportHarStartCapability({ sessionId: 'har-erasure' }, 42, undefined, sendResponse)
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'HAR capability issuance rejected during local data erasure',
    success: false,
  });
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// eslint-disable-next-line max-lines-per-function -- one route invocation matrix keeps ordered mock results auditable.
it('handles HAR stop validation, success, and failure branches', async () => {
  const missingStopResponse = vi.fn();
  const missingTokenResponse = vi.fn();
  const stopSuccessResponse = vi.fn();
  const stopFailureResponse = vi.fn();
  isExportHarStopPreauthorizedMock.mockReturnValueOnce(false);

  stopPreauthorizedExportHarSessionMock
    .mockResolvedValueOnce({ har: { entries: [] }, rawDiagnosticsEnabled: true })
    .mockRejectedValueOnce(new Error('stop failed'));

  expect(handleExportStopHar({}, 42, missingStopResponse)).toBe(true);
  expect(handleExportStopHar({ sessionId: 'har-1' }, 42, missingTokenResponse)).toBe(true);
  expect(
    handleExportStopHar(
      { capabilityToken: 'har-token-1', sessionId: 'har-1' },
      42,
      stopSuccessResponse
    )
  ).toBe(true);
  expect(
    handleExportStopHar(
      { capabilityToken: 'har-token-2', sessionId: 'har-2' },
      42,
      stopFailureResponse
    )
  ).toBe(true);

  await flushPromises();

  expect(missingStopResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Missing HAR session id',
  });
  expect(missingTokenResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Missing HAR capability token',
  });
  expect(stopSuccessResponse).toHaveBeenCalledWith({
    success: true,
    har: { entries: [] },
    rawDiagnosticsEnabled: true,
  });
  expect(stopPreauthorizedExportHarSessionMock).toHaveBeenNthCalledWith(
    1,
    { capabilityToken: 'har-token-1', sessionId: 'har-1' },
    'har-1',
    42,
    'har-token-1'
  );
  expect(stopFailureResponse).toHaveBeenCalledWith({
    success: false,
    error: 'stop failed',
  });
});

it('handles archive capture success and failure', async () => {
  const successResponse = vi.fn();
  const failureResponse = vi.fn();

  captureFullPageForArchiveMock
    .mockResolvedValueOnce('data:image/png;base64,7')
    .mockRejectedValueOnce(new Error('archive failed'));

  expect(handleExportCaptureFullPage(42, successResponse)).toBe(true);
  expect(handleExportCaptureFullPage(42, failureResponse)).toBe(true);

  await flushPromises();

  expect(successResponse).toHaveBeenCalledWith({
    success: true,
    dataUrl: 'data:image/png;base64,7',
  });
  expect(failureResponse).toHaveBeenCalledWith({
    success: false,
    error: 'archive failed',
  });
});
