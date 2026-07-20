import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ContentSenderBinding } from '../authorization/content-action';
import {
  consumeRecordingDownload,
  releaseRecordingDownload,
  resetRecordingDownloadStagingForTests,
  stageRecordingDownloadChunk,
} from './staged-recordings';

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
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
  resetRecordingDownloadStagingForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetRecordingDownloadStagingForTests();
});

it('stages chunks and consumes a recording blob once complete', async () => {
  expect(
    stageRecordingDownloadChunk({
      base64: Buffer.from('vid').toString('base64'),
      chunkIndex: 0,
      owner: recordingOwner,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
      totalBytes: 5,
      totalChunks: 2,
    })
  ).toEqual({ complete: false, stagedRecordingId: 'staged-recording-1' });

  expect(
    stageRecordingDownloadChunk({
      base64: Buffer.from('eo').toString('base64'),
      chunkIndex: 1,
      owner: recordingOwner,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
      totalBytes: 5,
      totalChunks: 2,
    })
  ).toEqual({ complete: true, stagedRecordingId: 'staged-recording-1' });

  const blob = consumeRecordingDownload({
    mimeType: 'video/webm',
    owner: recordingOwner,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
  });

  await expect(blob.text()).resolves.toBe('video');
  expect(blob.type).toBe('video/webm');
  expect(() =>
    consumeRecordingDownload({
      mimeType: 'video/webm',
      owner: recordingOwner,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
    })
  ).toThrow('Recording staged payload is missing or incomplete');
});

it('fails closed when restart clears staged recording authority', () => {
  stageRecordingDownloadChunk({
    base64: Buffer.from('video').toString('base64'),
    chunkIndex: 0,
    owner: recordingOwner,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
  });

  resetRecordingDownloadStagingForTests();

  expect(() =>
    consumeRecordingDownload({
      mimeType: 'video/webm',
      owner: recordingOwner,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
    })
  ).toThrow('Recording staged payload is missing or incomplete');
});

it('invalidates an existing staged recording on duplicate chunks', () => {
  const payload = {
    base64: Buffer.from('video').toString('base64'),
    chunkIndex: 0,
    owner: recordingOwner,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
  };

  stageRecordingDownloadChunk(payload);
  expect(() => stageRecordingDownloadChunk(payload)).toThrow(
    'Recording staged payload chunk was already received'
  );
  expect(() =>
    consumeRecordingDownload({
      mimeType: 'video/webm',
      owner: recordingOwner,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
    })
  ).toThrow('Recording staged payload is missing or incomplete');
});

it('releases partial staged recordings on request', () => {
  stageRecordingDownloadChunk({
    base64: Buffer.from('vid').toString('base64'),
    chunkIndex: 0,
    owner: recordingOwner,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 2,
  });

  releaseRecordingDownload({
    owner: recordingOwner,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
  });

  expect(() =>
    consumeRecordingDownload({
      mimeType: 'video/webm',
      owner: recordingOwner,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
    })
  ).toThrow('Recording staged payload is missing or incomplete');
});

it('rejects invalid metadata and wrong-owner release', () => {
  expect(() =>
    stageRecordingDownloadChunk({
      base64: 'not valid base64',
      chunkIndex: 0,
      owner: recordingOwner,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
      totalBytes: 5,
      totalChunks: 1,
    })
  ).toThrow('Recording staged payload chunk is invalid');

  stageRecordingDownloadChunk({
    base64: Buffer.from('video').toString('base64'),
    chunkIndex: 0,
    owner: recordingOwner,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
  });

  expect(() =>
    releaseRecordingDownload({
      owner: recordingOwner,
      recordingSessionId: 'recording-session-2',
      stagedRecordingId: 'staged-recording-1',
    })
  ).toThrow('Recording staged payload metadata changed');

  expect(() =>
    releaseRecordingDownload({
      owner: otherDocumentOwner,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
    })
  ).toThrow('Recording staged payload metadata changed');
});

it('rejects cross-document consume attempts with fresh owner authority', () => {
  stageRecordingDownloadChunk({
    base64: Buffer.from('video').toString('base64'),
    chunkIndex: 0,
    owner: recordingOwner,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
  });

  expect(() =>
    consumeRecordingDownload({
      mimeType: 'video/webm',
      owner: otherDocumentOwner,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
    })
  ).toThrow('Recording staged payload is missing or incomplete');
});
