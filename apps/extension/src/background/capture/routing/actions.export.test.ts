import { beforeEach, expect, it, vi } from 'vitest';

const { captureFullPageForArchiveMock } = vi.hoisted(() => ({
  captureFullPageForArchiveMock: vi.fn(),
}));

vi.mock('../index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../index')>()),
  captureFullPageForArchive: captureFullPageForArchiveMock,
}));

import type { PageAccessPort } from '../../routing-contracts/page-access-port';
import { cancelFullPageCaptureByExportRunId } from '../full-page/cancellation';
import { handleExportCaptureFullPage } from './actions.export';

const captureGeometry = {
  devicePixelRatio: 1,
  extentHeight: 1200,
  extentWidth: 800,
  outputHeight: 1200,
  outputWidth: 800,
  rootKind: 'document' as const,
  rootViewport: { height: 600, width: 800, x: 0, y: 0 },
  viewportHeight: 600,
  viewportWidth: 800,
};

function createPageAccessPort(): PageAccessPort {
  return {
    ensureActivePageAccessRuntime: vi.fn().mockResolvedValue(undefined),
    ensureNativeVisibleCaptureAuthority: vi.fn().mockResolvedValue(undefined),
  };
}

function createMessage(exportRunId = 'export-run-1') {
  return {
    contentIntent: { requestId: exportRunId, token: 'token-1' },
    exportRunId,
    type: 'EXPORT_CAPTURE_FULL_PAGE' as const,
  };
}

const senderBinding = {
  documentId: 'document-42',
  frameId: 0,
  requestId: 'export-run-1',
  senderUrl: 'https://example.test/page',
  tabId: 42,
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('captures through native visible authority and returns archive metadata', async () => {
  const sendResponse = vi.fn();
  const pageAccessPort = createPageAccessPort();
  captureFullPageForArchiveMock.mockResolvedValue({
    dataUrl: 'data:image/png;base64,7',
    metadata: { captureGeometry, downscaled: true, frozenExtentWarning: false },
  });

  expect(
    handleExportCaptureFullPage(createMessage(), 42, sendResponse, pageAccessPort, senderBinding)
  ).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(pageAccessPort.ensureActivePageAccessRuntime).toHaveBeenCalledWith(42);
  expect(pageAccessPort.ensureNativeVisibleCaptureAuthority).toHaveBeenCalledWith(42);
  expect(captureFullPageForArchiveMock).toHaveBeenCalledWith(42, {
    abortSignal: expect.any(AbortSignal),
    backendKind: 'native',
    documentId: 'document-42',
    exportRunId: 'export-run-1',
  });
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    captureGeometry,
    dataUrl: 'data:image/png;base64,7',
    downscaled: true,
    frozenExtentWarning: false,
  });
});

it('surfaces native capture failures', async () => {
  const sendResponse = vi.fn();
  captureFullPageForArchiveMock.mockRejectedValue(new Error('archive failed'));

  handleExportCaptureFullPage(
    createMessage(),
    42,
    sendResponse,
    createPageAccessPort(),
    senderBinding
  );

  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'archive failed' })
  );
});

it('fails closed when the page access owner is unavailable', async () => {
  const sendResponse = vi.fn();
  handleExportCaptureFullPage(createMessage(), 42, sendResponse, undefined, senderBinding);

  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Page access port unavailable.',
      success: false,
    })
  );
  expect(captureFullPageForArchiveMock).not.toHaveBeenCalled();
});

it('does not publish success when cancellation arrives before the archive response', async () => {
  let resolveCapture!: (value: {
    dataUrl: string;
    metadata: { downscaled: boolean; frozenExtentWarning: boolean };
  }) => void;
  captureFullPageForArchiveMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveCapture = resolve;
      })
  );
  const sendResponse = vi.fn();

  handleExportCaptureFullPage(
    createMessage('batch-publish-cancelled'),
    42,
    sendResponse,
    createPageAccessPort(),
    { ...senderBinding, requestId: 'batch-publish-cancelled' }
  );
  await vi.waitFor(() => expect(captureFullPageForArchiveMock).toHaveBeenCalled());
  expect(cancelFullPageCaptureByExportRunId('batch-publish-cancelled')).toBe(true);
  resolveCapture({
    dataUrl: 'data:image/png;base64,discarded',
    metadata: { downscaled: false, frozenExtentWarning: false },
  });

  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Full-page capture cancelled',
      success: false,
    })
  );
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
      type: 'EXPORT_CAPTURE_FULL_PAGE',
    },
    42,
    sendResponse,
    createPageAccessPort(),
    senderBinding
  );

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Full-page export capability identity mismatch',
    success: false,
  });
  expect(captureFullPageForArchiveMock).not.toHaveBeenCalled();
});

it('rejects missing document bindings and duplicate export-run ownership', async () => {
  const sendResponse = vi.fn();
  handleExportCaptureFullPage(
    createMessage('missing-binding'),
    42,
    sendResponse,
    createPageAccessPort()
  );
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Full-page export document binding is unavailable',
    success: false,
  });

  let resolveCapture!: (value: {
    dataUrl: string;
    metadata: { downscaled: boolean; frozenExtentWarning: boolean };
  }) => void;
  captureFullPageForArchiveMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveCapture = resolve;
      })
  );
  const firstResponse = vi.fn();
  handleExportCaptureFullPage(
    createMessage('duplicate-run'),
    42,
    firstResponse,
    createPageAccessPort(),
    { ...senderBinding, requestId: 'duplicate-run' }
  );
  await vi.waitFor(() => expect(captureFullPageForArchiveMock).toHaveBeenCalled());

  const duplicateResponse = vi.fn();
  handleExportCaptureFullPage(
    createMessage('duplicate-run'),
    42,
    duplicateResponse,
    createPageAccessPort(),
    { ...senderBinding, requestId: 'duplicate-run' }
  );
  expect(duplicateResponse).toHaveBeenCalledWith({
    error: 'A full-page capture already owns this export run',
    success: false,
  });

  resolveCapture({
    dataUrl: 'data:image/png;base64,done',
    metadata: { downscaled: false, frozenExtentWarning: false },
  });
  await vi.waitFor(() => expect(firstResponse).toHaveBeenCalled());
});
