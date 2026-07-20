import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoExportMessageContracts } from './export';

function parseSidecarRequest(payload: {
  content?: string;
  base64?: string;
  filename: string;
  mimeType: string;
}): unknown {
  return runtimeVideoExportMessageContracts[
    VideoMessageType.DOWNLOAD_RECORDING_SIDECAR
  ].parseRequest({
    ...payload,
    type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR,
  });
}

it('rejects unsafe recording sidecar payloads before runtime dispatch', () => {
  expect(() =>
    parseSidecarRequest({
      content: 'WEBVTT',
      filename: '../capture.vtt',
      mimeType: 'text/vtt',
    })
  ).toThrow(/DOWNLOAD_RECORDING_SIDECAR/);
  expect(() =>
    parseSidecarRequest({
      content: 'WEBVTT',
      filename: 'capture.html',
      mimeType: 'text/html',
    })
  ).toThrow(/DOWNLOAD_RECORDING_SIDECAR/);
  expect(() =>
    parseSidecarRequest({
      content: 'A'.repeat(5 * 1024 * 1024 + 1),
      filename: 'capture.vtt',
      mimeType: 'text/vtt',
    })
  ).toThrow(/DOWNLOAD_RECORDING_SIDECAR/);
  expect(() =>
    parseSidecarRequest({
      base64: 'dnR0',
      filename: 'capture.vtt',
      mimeType: 'text/vtt',
    })
  ).toThrow(/DOWNLOAD_RECORDING_SIDECAR/);
});
