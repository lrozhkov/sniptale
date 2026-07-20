import { afterEach, expect, it, vi } from 'vitest';

import { resolveRecordingStartMimeType } from './mime';

function installMediaRecorderSupport(supportedMimeTypes: string[]) {
  vi.stubGlobal('MediaRecorder', {
    isTypeSupported: vi.fn((mimeType: string) => supportedMimeTypes.includes(mimeType)),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('prefers MP4 recording when the browser supports an audio-compatible MP4 recorder', () => {
  installMediaRecorderSupport(['video/mp4;codecs=avc1.42E01E,mp4a.40.2']);

  expect(
    resolveRecordingStartMimeType({
      fallbackMimeType: () => 'video/webm;codecs=vp9,opus',
      hasAudioTracks: true,
      preferredMimeType: 'video/webm;codecs=vp9,opus',
      usesDerivedVideoStream: false,
    })
  ).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
});

it('prefers MP4 recording when the browser supports a video-only MP4 recorder', () => {
  installMediaRecorderSupport(['video/mp4;codecs=avc1.640028']);

  expect(
    resolveRecordingStartMimeType({
      fallbackMimeType: () => 'video/webm;codecs=vp9',
      hasAudioTracks: false,
      preferredMimeType: 'video/webm;codecs=vp9',
      usesDerivedVideoStream: false,
    })
  ).toBe('video/mp4;codecs=avc1.640028');
});

it('keeps the existing WebM fallback order when MP4 recording is unsupported', () => {
  installMediaRecorderSupport(['video/webm;codecs=vp8']);

  expect(
    resolveRecordingStartMimeType({
      fallbackMimeType: () => 'video/webm;codecs=vp9',
      hasAudioTracks: false,
      preferredMimeType: 'video/webm;codecs=vp9',
      usesDerivedVideoStream: true,
    })
  ).toBe('video/webm;codecs=vp8');
});
