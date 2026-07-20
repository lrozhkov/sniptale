import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { saveRecordingBlobForDownloadMock } = vi.hoisted(() => ({
  saveRecordingBlobForDownloadMock: vi.fn(),
}));

vi.mock('../../media-hub/recording-download', () => ({
  downloadRecordingSidecar: vi.fn(),
  downloadStoredRecording: vi.fn(),
  saveRecordingBlobForDownload: saveRecordingBlobForDownloadMock,
}));

import {
  handleReleaseRecordingDownload,
  handleSaveRecordingForDownload,
  handleStageRecordingDownloadChunk,
} from './actions.download';
import { resetRecordingDownloadStagingForTests } from './recording-download/staged-recordings';
import type { ContentSenderBinding } from './authorization/content-action';

const recordingOwner: ContentSenderBinding = {
  documentId: 'document-1',
  frameId: 0,
  senderUrl: 'https://example.test/page',
  tabId: 7,
};

const otherDocumentOwner: ContentSenderBinding = {
  ...recordingOwner,
  documentId: 'document-2',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
  saveRecordingBlobForDownloadMock.mockResolvedValue({ downloadId: 17, recordingId: 'rec-1' });
  resetRecordingDownloadStagingForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetRecordingDownloadStagingForTests();
});

it('routes staged content recording payloads through the recording download owner', async () => {
  const sendResponse = vi.fn();

  expect(
    handleStageRecordingDownloadChunk(
      createStageChunkMessage({ payload: 'video' }),
      recordingOwner,
      sendResponse
    )
  ).toBe(true);
  await flushPromises();

  expect(handleSaveRecordingForDownload(createSaveMessage(), recordingOwner, sendResponse)).toBe(
    true
  );
  await flushPromises();

  expect(saveRecordingBlobForDownloadMock).toHaveBeenCalledWith({
    blob: expect.any(Blob),
    filename: 'clip.webm',
    mimeType: 'video/webm',
  });
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'accepted',
    downloadId: 17,
    recordingId: 'rec-1',
  });
});

it('releases partial staged recordings through the recording route owner', async () => {
  const sendResponse = vi.fn();

  expect(
    handleStageRecordingDownloadChunk(
      createStageChunkMessage({ payload: 'vid', totalBytes: 5, totalChunks: 2 }),
      recordingOwner,
      sendResponse
    )
  ).toBe(true);
  await flushPromises();

  expect(handleReleaseRecordingDownload(createReleaseMessage(), recordingOwner, sendResponse)).toBe(
    true
  );
  await flushPromises();

  expect(sendResponse).toHaveBeenLastCalledWith({ success: true, result: 'released' });
});

it('rejects fresh wrong-document owners for staged recording save and release', async () => {
  const sendResponse = vi.fn();

  handleStageRecordingDownloadChunk(
    createStageChunkMessage({ payload: 'video' }),
    recordingOwner,
    sendResponse
  );
  await flushPromises();

  handleSaveRecordingForDownload(createSaveMessage(), otherDocumentOwner, sendResponse);
  await flushPromises();

  expect(saveRecordingBlobForDownloadMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'Recording staged payload is missing or incomplete',
    success: false,
  });

  handleReleaseRecordingDownload(createReleaseMessage(), otherDocumentOwner, sendResponse);
  await flushPromises();

  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'Recording staged payload metadata changed',
    success: false,
  });

  handleSaveRecordingForDownload(createSaveMessage(), recordingOwner, sendResponse);
  await flushPromises();

  expect(saveRecordingBlobForDownloadMock).toHaveBeenCalledWith({
    blob: expect.any(Blob),
    filename: 'clip.webm',
    mimeType: 'video/webm',
  });
});

it('rejects legacy direct-base64 recording saves before saving recordings', async () => {
  const sendResponse = vi.fn();

  expect(
    handleSaveRecordingForDownload(
      {
        filename: 'clip.webm',
        mimeType: 'video/webm',
        recordingSessionId: '../recording-session',
        stagedRecordingId: 'staged-recording-1',
      },
      recordingOwner,
      sendResponse
    )
  ).toBe(true);

  await flushPromises();

  expect(saveRecordingBlobForDownloadMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Invalid recording download payload',
  });
});

function createStageChunkMessage(args: {
  payload: string;
  totalBytes?: number;
  totalChunks?: number;
}) {
  return {
    base64: Buffer.from(args.payload).toString('base64'),
    chunkIndex: 0,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: args.totalBytes ?? args.payload.length,
    totalChunks: args.totalChunks ?? 1,
  };
}

function createSaveMessage() {
  return {
    filename: 'clip.webm',
    mimeType: 'video/webm',
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
  };
}

function createReleaseMessage() {
  return {
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
