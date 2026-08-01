// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';
import { configureRegionCaptureRecorder } from './helpers';

function createStream(hasAudio = false): MediaStream {
  return {
    getAudioTracks: () => (hasAudio ? ([{ kind: 'audio' }] as MediaStreamTrack[]) : []),
    getVideoTracks: () =>
      [
        {
          getSettings: () => ({ frameRate: 30, height: 1080, width: 1920 }),
          kind: 'video',
        },
      ] as MediaStreamTrack[],
  } as MediaStream;
}

function createSettings() {
  return {
    microphoneEnabled: false,
    output: DEFAULT_VIDEO_RECORDING_OUTPUT_SETTINGS,
    quality: VideoQuality.MEDIUM,
    systemAudioEnabled: false,
  };
}

it('wires MediaRecorder progress, stop, and error events into the recorder bridge', () => {
  const mediaRecorderStart = vi.fn();
  class FakeMediaRecorder {
    static isTypeSupported = vi.fn(() => true);
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;

    constructor(_stream: MediaStream, _options: MediaRecorderOptions) {}

    start = mediaRecorderStart;
  }

  const recordedChunks: Blob[] = [];
  const onProgress = vi.fn();
  const onSaveRecording = vi.fn();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder);

  const recorder = configureRegionCaptureRecorder({
    finalStream: createStream(),
    onProgress,
    onSaveRecording,
    settings: createSettings(),
    recordedChunks,
  });

  recorder.ondataavailable?.({ data: new Blob(['chunk']) } as BlobEvent);
  recorder.onerror?.(
    new ErrorEvent('error', {
      error: new Error('recorder failed'),
      message: 'recorder failed',
    })
  );
  recorder.onstop?.(new Event('stop'));

  expect(recordedChunks).toHaveLength(1);
  expect(onProgress).toHaveBeenCalledWith({ size: recordedChunks[0]?.size, type: 'CHUNK' });
  expect(onProgress).toHaveBeenCalledWith({ error: 'recorder failed', type: 'ERROR' });
  expect(onSaveRecording).toHaveBeenCalledOnce();
});

it('uses the selected WebM codec without a generic MIME fallback', () => {
  class FakeMediaRecorder {
    static isTypeSupported = vi.fn((mimeType: string) => mimeType === 'video/webm;codecs=vp9,opus');
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;

    constructor(
      _stream: MediaStream,
      readonly options: MediaRecorderOptions
    ) {}
  }

  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder);

  const recorder = configureRegionCaptureRecorder({
    finalStream: createStream(true),
    onProgress: null,
    onSaveRecording: vi.fn(),
    settings: createSettings(),
    recordedChunks: [],
  }) as unknown as FakeMediaRecorder;

  expect(recorder.options.mimeType).toBe('video/webm;codecs=vp9,opus');
});

it('stringifies non-Error recorder errors', () => {
  class FakeMediaRecorder {
    static isTypeSupported = vi.fn((mimeType: string) => mimeType === 'video/webm;codecs=vp9');
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;

    constructor(
      _stream: MediaStream,
      readonly options: MediaRecorderOptions
    ) {}
  }

  const onProgress = vi.fn();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder);

  const recorder = configureRegionCaptureRecorder({
    finalStream: createStream(),
    onProgress,
    onSaveRecording: vi.fn(),
    settings: createSettings(),
    recordedChunks: [],
  }) as unknown as FakeMediaRecorder;

  recorder.onerror?.(new Event('error'));

  expect(recorder.options.mimeType).toBe('video/webm;codecs=vp9');
  expect(onProgress).toHaveBeenCalledWith({
    error: '[object Event]',
    type: 'ERROR',
  });
});

it('rejects an unsupported selected container and codec', () => {
  class FakeMediaRecorder {
    static isTypeSupported = vi.fn(() => false);
  }

  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder);

  expect(() =>
    configureRegionCaptureRecorder({
      finalStream: createStream(),
      onProgress: null,
      onSaveRecording: vi.fn(),
      settings: createSettings(),
      recordedChunks: [],
    })
  ).toThrow('selected recording container and codec are not supported');
});
