import { beforeEach, expect, it, vi } from 'vitest';

const {
  downloadRecordingSidecarMock,
  downloadStoredRecordingMock,
  saveRecordingBlobForDownloadMock,
} = vi.hoisted(() => ({
  downloadRecordingSidecarMock: vi.fn(),
  downloadStoredRecordingMock: vi.fn(),
  saveRecordingBlobForDownloadMock: vi.fn(),
}));

vi.mock('../../../../../media-hub/recording-download', () => ({
  downloadRecordingSidecar: downloadRecordingSidecarMock,
  downloadStoredRecording: downloadStoredRecordingMock,
  saveRecordingBlobForDownload: saveRecordingBlobForDownloadMock,
}));

vi.mock('../../../../../routing-contracts/response', () => ({
  createRouteErrorResponse: vi.fn(),
  respondAsyncRoute: vi.fn(),
  respondAsyncRouteEffect: vi.fn(),
  respondAsyncRouteWithLogger: vi.fn(
    ({
      work,
      sendResponse,
    }: {
      work: Promise<unknown>;
      sendResponse: (response?: unknown) => void;
    }) => void work.then((response) => sendResponse(response)).catch(() => undefined)
  ),
  respondAsyncSuccess: vi.fn(),
}));

import { handleDownloadRecording, handleDownloadRecordingSidecar } from './download';

function createSendResponse() {
  return vi.fn<(response?: unknown) => void>();
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  downloadRecordingSidecarMock.mockResolvedValue(18);
  downloadStoredRecordingMock.mockResolvedValue(17);
});

it('downloads recordings through the background route', async () => {
  const sendResponse = createSendResponse();

  expect(
    handleDownloadRecording({ recordingId: 'recording-1', filename: 'clip.webm' }, sendResponse)
  ).toEqual({ handled: true, keepChannelOpen: true });
  await flushPromises();

  expect(downloadStoredRecordingMock).toHaveBeenCalledWith('recording-1', 'clip.webm');
  expect(sendResponse).toHaveBeenCalledWith({ success: true, downloadId: 17 });
});

it('downloads recording sidecars through the offscreen-only background route', async () => {
  const sendResponse = createSendResponse();

  handleDownloadRecordingSidecar(
    { content: 'WEBVTT', filename: 'clip.vtt', mimeType: 'text/vtt' },
    sendResponse
  );
  await flushPromises();

  expect(downloadRecordingSidecarMock).toHaveBeenCalledWith({
    content: 'WEBVTT',
    filename: 'clip.vtt',
    mimeType: 'text/vtt',
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true, downloadId: 18 });
});
