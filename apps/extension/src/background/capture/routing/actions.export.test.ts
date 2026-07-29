import { beforeEach, expect, it, vi } from 'vitest';

const {
  captureFullPageForArchiveMock,
  isExportHarStopPreauthorizedMock,
  issueExportHarStartCapabilityMock,
  getPreauthorizedContentActionRouteMessageMock,
  stopPreauthorizedExportHarSessionMock,
} = vi.hoisted(() => ({
  captureFullPageForArchiveMock: vi.fn(),
  isExportHarStopPreauthorizedMock: vi.fn(),
  issueExportHarStartCapabilityMock: vi.fn(),
  getPreauthorizedContentActionRouteMessageMock: vi.fn(),
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

vi.mock('./authorization/content-action', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./authorization/content-action')>()),
  getPreauthorizedContentActionRouteMessage: getPreauthorizedContentActionRouteMessageMock,
}));

import {
  handleExportCaptureFullPage,
  handleRequestExportHarStartCapability,
  handleExportStopHar,
} from './actions.export';
import type { PageAccessPort } from '../../routing-contracts/page-access-port';
import { cancelFullPageCaptureByExportRunId } from '../full-page/cancellation';

function createPageAccessPort(): PageAccessPort {
  return {
    ensureActivePageAccessRuntime: vi.fn().mockResolvedValue(undefined),
    ensureNativeVisibleCaptureAuthority: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  captureFullPageForArchiveMock.mockResolvedValue('data:image/png;base64,7');
  isExportHarStopPreauthorizedMock.mockReturnValue(true);
  issueExportHarStartCapabilityMock.mockReturnValue('start-capability-token');
  getPreauthorizedContentActionRouteMessageMock.mockReturnValue({
    documentId: 'document-42',
    tabId: 42,
  });
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
  const pageAccessPort = createPageAccessPort();
  const message = {
    contentIntent: { requestId: 'export-run-1', token: 'token-1' },
    exportRunId: 'export-run-1',
    type: 'EXPORT_CAPTURE_FULL_PAGE' as const,
  };

  captureFullPageForArchiveMock
    .mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,7',
      metadata: { downscaled: true, frozenExtentWarning: false },
    })
    .mockRejectedValueOnce(new Error('archive failed'));

  expect(handleExportCaptureFullPage(message, 42, successResponse, pageAccessPort)).toBe(true);
  await vi.waitFor(() => expect(successResponse).toHaveBeenCalled());
  expect(handleExportCaptureFullPage(message, 42, failureResponse, pageAccessPort)).toBe(true);
  await vi.waitFor(() => expect(failureResponse).toHaveBeenCalled());

  expect(successResponse).toHaveBeenCalledWith({
    success: true,
    dataUrl: 'data:image/png;base64,7',
    downscaled: true,
    frozenExtentWarning: false,
  });
  expect(failureResponse).toHaveBeenCalledWith({
    success: false,
    error: 'archive failed',
  });
  expect(captureFullPageForArchiveMock).toHaveBeenCalledWith(42, {
    abortSignal: expect.any(AbortSignal),
    backendKind: 'native',
    documentId: 'document-42',
    exportRunId: 'export-run-1',
  });
});

it('uses owner-scoped unattended capture without requesting active-tab authority', async () => {
  const sendResponse = vi.fn();
  const ensureActivePageAccessRuntime = vi.fn().mockResolvedValue(undefined);
  const ensureNativeVisibleCaptureAuthority = vi.fn().mockResolvedValue(undefined);
  const pageAccessPort: PageAccessPort = {
    ensureActivePageAccessRuntime,
    ensureNativeVisibleCaptureAuthority,
  };
  captureFullPageForArchiveMock.mockResolvedValueOnce({
    dataUrl: 'data:image/png;base64,unattended',
    metadata: { downscaled: false, frozenExtentWarning: false },
  });

  handleExportCaptureFullPage(
    {
      contentIntent: { requestId: 'batch-1', token: 'token-1' },
      exportRunId: 'batch-1',
      type: 'EXPORT_CAPTURE_FULL_PAGE_UNATTENDED',
    },
    42,
    sendResponse,
    pageAccessPort
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(ensureActivePageAccessRuntime).toHaveBeenCalledWith(42);
  expect(ensureNativeVisibleCaptureAuthority).not.toHaveBeenCalled();
  expect(captureFullPageForArchiveMock).toHaveBeenCalledWith(42, {
    abortSignal: expect.any(AbortSignal),
    backendKind: 'unattended-cdp',
    documentId: 'document-42',
    exportRunId: 'batch-1',
  });
});

it('does not publish success when cancellation arrives before the archive response', async () => {
  let resolveCapture: (value: {
    dataUrl: string;
    metadata: { downscaled: boolean; frozenExtentWarning: boolean };
  }) => void = () => undefined;
  captureFullPageForArchiveMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveCapture = resolve;
      })
  );
  const sendResponse = vi.fn();

  handleExportCaptureFullPage(
    {
      contentIntent: { requestId: 'batch-publish-cancelled', token: 'token-1' },
      exportRunId: 'batch-publish-cancelled',
      type: 'EXPORT_CAPTURE_FULL_PAGE_UNATTENDED',
    },
    42,
    sendResponse,
    createPageAccessPort()
  );
  await vi.waitFor(() => expect(captureFullPageForArchiveMock).toHaveBeenCalled());
  expect(cancelFullPageCaptureByExportRunId('batch-publish-cancelled')).toBe(true);
  resolveCapture({
    dataUrl: 'data:image/png;base64,discarded',
    metadata: { downscaled: false, frozenExtentWarning: false },
  });

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Full-page capture cancelled',
      success: false,
    });
  });
  expect(sendResponse).not.toHaveBeenCalledWith(
    expect.objectContaining({ dataUrl: expect.any(String), success: true })
  );
});

it('rejects export-run and capability identity mismatches before privileged effects', () => {
  const sendResponse = vi.fn();

  handleExportCaptureFullPage(
    {
      contentIntent: { requestId: 'export-run-old', token: 'token-1' },
      exportRunId: 'export-run-new',
      type: 'EXPORT_CAPTURE_FULL_PAGE_UNATTENDED',
    },
    42,
    sendResponse,
    createPageAccessPort()
  );

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Full-page export capability identity mismatch',
    success: false,
  });
  expect(captureFullPageForArchiveMock).not.toHaveBeenCalled();
});
