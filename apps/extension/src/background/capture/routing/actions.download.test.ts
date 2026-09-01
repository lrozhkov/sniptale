import { beforeEach, expect, it, vi } from 'vitest';

const {
  executeDownloadMock,
  createRenderedCaptureJobMock,
  openEditorWithImageMock,
  transitionCaptureJobMock,
  consumeRecentCaptureEditorAssetCapabilityMock,
  getPreauthorizedContentActionRouteMessageMock,
} = vi.hoisted(() => ({
  executeDownloadMock: vi.fn(),
  createRenderedCaptureJobMock: vi.fn(),
  openEditorWithImageMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
  consumeRecentCaptureEditorAssetCapabilityMock: vi.fn(),
  getPreauthorizedContentActionRouteMessageMock: vi.fn(),
}));

vi.mock('../editor/recent-asset-capability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor/recent-asset-capability')>()),
  consumeRecentCaptureEditorAssetCapability: consumeRecentCaptureEditorAssetCapabilityMock,
}));

vi.mock('./authorization/content-action', () => ({
  getPreauthorizedContentActionRouteMessage: getPreauthorizedContentActionRouteMessageMock,
}));

vi.mock('../download/download-router/index', () => ({
  buildDownloadFilename: vi.fn(),
  createDownloadRouterService: vi.fn(),
  executeDownload: executeDownloadMock,
  executeDownloadBlob: vi.fn(),
  resolvePresetPath: vi.fn(),
}));

vi.mock('../editor/index', () => ({
  openEditorWithImage: openEditorWithImageMock,
  resolveBlobFromPayload: vi.fn(),
}));

vi.mock('../jobs/rendered-job', () => ({
  createRenderedCaptureJob: createRenderedCaptureJobMock,
}));

vi.mock('../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/state-machine')>()),
  transitionCaptureJob: transitionCaptureJobMock,
}));

import { handleExecuteSave, handleOpenEditorWithImage } from './actions.download';

beforeEach(() => {
  vi.clearAllMocks();
  executeDownloadMock.mockResolvedValue(undefined);
  openEditorWithImageMock.mockResolvedValue(undefined);
  createRenderedCaptureJobMock.mockResolvedValue('capture-job-route');
  transitionCaptureJobMock.mockResolvedValue(undefined);
  consumeRecentCaptureEditorAssetCapabilityMock.mockReturnValue(true);
  getPreauthorizedContentActionRouteMessageMock.mockReturnValue({
    documentId: 'document-1',
    frameId: 0,
    requestId: 'open-request-1',
    senderUrl: 'https://example.test/page',
    tabId: 42,
  });
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

it('routes execute-save through async success responses', async () => {
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
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('routes editor requests through async success responses', async () => {
  const sendResponse = vi.fn();

  expect(handleOpenEditorWithImage({ dataUrl: 'data:image/png;base64,2' }, 42, sendResponse)).toBe(
    true
  );

  await flushPromises();

  expect(openEditorWithImageMock).toHaveBeenCalledWith('data:image/png;base64,2', {
    tabId: 42,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
});

it('links editor requests to an existing draft asset when provided', async () => {
  const sendResponse = vi.fn();

  expect(
    handleOpenEditorWithImage(
      {
        assetId: 'asset-1',
        dataUrl: 'data:image/png;base64,2',
        editorAssetCapability: { requestId: 'capture-request-1', token: 'editor-token-1' },
      },
      42,
      sendResponse
    )
  ).toBe(true);
  await flushPromises();

  expect(consumeRecentCaptureEditorAssetCapabilityMock).toHaveBeenCalledWith({
    assetId: 'asset-1',
    capability: { requestId: 'capture-request-1', token: 'editor-token-1' },
    senderBinding: expect.objectContaining({ documentId: 'document-1', tabId: 42 }),
  });

  expect(openEditorWithImageMock).toHaveBeenCalledWith('data:image/png;base64,2', {
    assetId: 'asset-1',
    tabId: 42,
  });
});

it('rejects arbitrary editor asset ids that are not bound to the latest capture', () => {
  consumeRecentCaptureEditorAssetCapabilityMock.mockReturnValue(false);
  const sendResponse = vi.fn();
  expect(
    handleOpenEditorWithImage(
      {
        assetId: 'asset-x',
        dataUrl: 'data:image/png;base64,2',
        editorAssetCapability: { requestId: 'capture-request-1', token: 'editor-token-1' },
      },
      42,
      sendResponse
    )
  ).toBe(true);
  expect(openEditorWithImageMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
});

it('reports execute-save and editor failures through route errors', async () => {
  const downloadFailureResponse = vi.fn();
  const editorFailureResponse = vi.fn();

  executeDownloadMock.mockRejectedValueOnce(new Error('download failed'));
  openEditorWithImageMock.mockRejectedValueOnce(new Error('editor failed'));

  expect(
    handleExecuteSave(
      {
        dataUrl: 'data:image/png;base64,1',
        filename: 'capture.png',
        actionType: 'download_default',
      },
      42,
      downloadFailureResponse
    )
  ).toBe(true);
  expect(
    handleOpenEditorWithImage({ dataUrl: 'data:image/png;base64,2' }, 42, editorFailureResponse)
  ).toBe(true);

  await flushPromises();

  expect(downloadFailureResponse).toHaveBeenCalledWith({
    success: false,
    error: 'download failed',
  });
  expect(transitionCaptureJobMock).toHaveBeenCalledWith('capture-job-route', 'failed', {
    error: 'download failed',
  });
  expect(editorFailureResponse).toHaveBeenCalledWith({
    success: false,
    error: 'editor failed',
  });
});
