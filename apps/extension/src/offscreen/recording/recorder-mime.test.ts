import { afterEach, expect, it, vi } from 'vitest';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';

import {
  buildVideoMediaRecorderOptions,
  getFirstSupportedMediaRecorderMimeType,
  RECORDING_MIME_TYPE_CANDIDATES,
  WEBM_EXPORT_MIME_TYPE_CANDIDATES,
} from './recorder-mime';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('returns the first supported MediaRecorder mime type from the provided candidates', () => {
  const mediaRecorderMock = {
    isTypeSupported: vi.fn((type: string) => type === 'video/webm;codecs=vp8,opus'),
  };

  vi.stubGlobal('MediaRecorder', mediaRecorderMock);

  expect(getFirstSupportedMediaRecorderMimeType(RECORDING_MIME_TYPE_CANDIDATES)).toBe(
    'video/webm;codecs=vp8,opus'
  );
  expect(getFirstSupportedMediaRecorderMimeType(WEBM_EXPORT_MIME_TYPE_CANDIDATES)).toBe(
    'video/webm;codecs=vp8,opus'
  );
});

it('falls back when no MediaRecorder mime type candidate is supported', () => {
  vi.stubGlobal('MediaRecorder', {
    isTypeSupported: vi.fn(() => false),
  });

  expect(getFirstSupportedMediaRecorderMimeType(RECORDING_MIME_TYPE_CANDIDATES)).toBe('video/webm');
  expect(getFirstSupportedMediaRecorderMimeType(['video/mp4'], 'video/mp4')).toBe('video/mp4');
});

it('builds video recorder options from the supported quality configuration', () => {
  vi.stubGlobal('MediaRecorder', {
    isTypeSupported: vi.fn(() => true),
  });

  expect(buildVideoMediaRecorderOptions(createSettings())).toEqual({
    mimeType: VIDEO_QUALITY_CONFIGS[VideoQuality.HIGH].mimeType,
    videoBitsPerSecond: VIDEO_QUALITY_CONFIGS[VideoQuality.HIGH].videoBitsPerSecond,
  });
});

it('falls back to plain WebM when the requested MIME type is unsupported', () => {
  vi.stubGlobal('MediaRecorder', {
    isTypeSupported: vi.fn(() => false),
  });

  expect(buildVideoMediaRecorderOptions(createSettings())).toEqual({
    mimeType: 'video/webm',
    videoBitsPerSecond: expect.any(Number),
  });
});

function createSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
  };
}
