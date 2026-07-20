import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionSaveMessageContracts } from './save';

it('parses recording save requests from content recording owners', () => {
  const contract = runtimeActionSaveMessageContracts[MessageType.SAVE_RECORDING_FOR_DOWNLOAD];

  expect(
    contract.parseRequest({
      filename: 'clip.webm',
      mimeType: 'video/webm',
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
      type: MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
    })
  ).toEqual({
    filename: 'clip.webm',
    mimeType: 'video/webm',
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    type: MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
  });
  expect(() =>
    contract.parseRequest({
      filename: 'clip.webm',
      type: MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
    })
  ).toThrow('runtime SAVE_RECORDING_FOR_DOWNLOAD message');
});

it('parses staged recording download requests and release messages', () => {
  const stageContract =
    runtimeActionSaveMessageContracts[MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK];
  const releaseContract = runtimeActionSaveMessageContracts[MessageType.RELEASE_RECORDING_DOWNLOAD];

  expect(
    stageContract.parseRequest({
      base64: 'dmlkZW8=',
      chunkIndex: 0,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
      totalBytes: 5,
      totalChunks: 1,
      type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    })
  ).toEqual({
    base64: 'dmlkZW8=',
    chunkIndex: 0,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
    type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
  });
  expect(
    stageContract.parseResponse({
      complete: true,
      stagedRecordingId: 'staged-recording-1',
      success: true,
    })
  ).toEqual({
    complete: true,
    stagedRecordingId: 'staged-recording-1',
    success: true,
  });
  expect(
    releaseContract.parseRequest({
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
      type: MessageType.RELEASE_RECORDING_DOWNLOAD,
    })
  ).toEqual({
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    type: MessageType.RELEASE_RECORDING_DOWNLOAD,
  });
});

it('rejects malformed recording save payloads at the runtime contract', () => {
  const stageContract =
    runtimeActionSaveMessageContracts[MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK];
  const saveContract = runtimeActionSaveMessageContracts[MessageType.SAVE_RECORDING_FOR_DOWNLOAD];

  expect(() =>
    stageContract.parseRequest({
      base64: 'not valid base64',
      chunkIndex: 0,
      recordingSessionId: 'recording-session-1',
      stagedRecordingId: 'staged-recording-1',
      totalBytes: 5,
      totalChunks: 1,
      type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    })
  ).toThrow('runtime STAGE_RECORDING_DOWNLOAD_CHUNK message');
  expect(() =>
    saveContract.parseRequest({
      base64: 'dmlkZW8=',
      filename: 'clip.webm',
      mimeType: 'video/webm',
      type: MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
    })
  ).toThrow('runtime SAVE_RECORDING_FOR_DOWNLOAD message');
});
