import { beforeEach, expect, it, vi } from 'vitest';

const {
  executeDownloadMock,
  createRenderedCaptureJobMock,
  openEditorWithImageMock,
  transitionCaptureJobMock,
} = vi.hoisted(() => ({
  executeDownloadMock: vi.fn(),
  createRenderedCaptureJobMock: vi.fn(),
  openEditorWithImageMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
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

  expect(handleOpenEditorWithImage('data:image/png;base64,2', 42, sendResponse)).toBe(true);

  await flushPromises();

  expect(openEditorWithImageMock).toHaveBeenCalledWith('data:image/png;base64,2', {
    tabId: 42,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
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
  expect(handleOpenEditorWithImage('data:image/png;base64,2', 42, editorFailureResponse)).toBe(
    true
  );

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
