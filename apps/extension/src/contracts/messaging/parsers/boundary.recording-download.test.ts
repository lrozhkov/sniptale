import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { parseBackgroundRuntimeMessage, parseRuntimeResponseForMessage } from './boundary';

it('accepts recording download messages for recording and sidecar payloads', () => {
  expect(
    parseBackgroundRuntimeMessage({
      type: VideoMessageType.DOWNLOAD_RECORDING,
      recordingId: 'recording-1',
      filename: 'clip.webm',
    })
  ).toEqual({
    type: VideoMessageType.DOWNLOAD_RECORDING,
    recordingId: 'recording-1',
    filename: 'clip.webm',
  });

  expect(
    parseBackgroundRuntimeMessage({
      type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
      content: 'WEBVTT',
      filename: 'clip.vtt',
      mimeType: 'text/vtt',
    })
  ).toEqual({
    type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
    content: 'WEBVTT',
    filename: 'clip.vtt',
    mimeType: 'text/vtt',
  });

  expect(
    parseRuntimeResponseForMessage(VideoMessageType.DOWNLOAD_RECORDING, {
      success: true,
      downloadId: 17,
    })
  ).toEqual({ success: true, downloadId: 17 });
  expect(parseRuntimeResponseForMessage(VideoMessageType.CAPTURE_SOURCE_OBTAINED, undefined)).toBe(
    undefined
  );
});

it('rejects malformed recording download payloads', () => {
  expect(() =>
    parseBackgroundRuntimeMessage({
      type: VideoMessageType.DOWNLOAD_RECORDING,
      filename: 'clip.webm',
    })
  ).toThrow(MessageContractError);

  expect(() =>
    parseBackgroundRuntimeMessage({
      type: VideoMessageType.DOWNLOAD_RECORDING,
      url: 'blob:recording-url',
      filename: 'clip.webm',
    })
  ).toThrow(MessageContractError);

  expect(() =>
    parseBackgroundRuntimeMessage({
      type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
      base64: 'dnR0',
      filename: 'clip.vtt',
      mimeType: 'text/vtt',
    })
  ).toThrow(MessageContractError);
});
