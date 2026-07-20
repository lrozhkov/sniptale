// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { configureRegionCaptureRecorder } from './helpers';

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
    finalStream: { kind: 'final-stream' } as unknown as MediaStream,
    onProgress,
    onSaveRecording,
    quality: VideoQuality.MEDIUM,
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

it('falls back to the shared webm recorder mime type when the preferred codec is unsupported', () => {
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
    finalStream: { kind: 'final-stream' } as unknown as MediaStream,
    onProgress: null,
    onSaveRecording: vi.fn(),
    quality: VideoQuality.MEDIUM,
    recordedChunks: [],
  }) as unknown as FakeMediaRecorder;

  expect(recorder.options.mimeType).toBe('video/webm;codecs=vp9,opus');
});

it('falls back to plain webm and stringifies non-Error recorder errors', () => {
  class FakeMediaRecorder {
    static isTypeSupported = vi.fn(() => false);
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
    finalStream: { kind: 'final-stream' } as unknown as MediaStream,
    onProgress,
    onSaveRecording: vi.fn(),
    quality: VideoQuality.HIGH,
    recordedChunks: [],
  }) as unknown as FakeMediaRecorder;

  recorder.onerror?.(new Event('error'));

  expect(recorder.options.mimeType).toBe('video/webm');
  expect(onProgress).toHaveBeenCalledWith({
    error: '[object Event]',
    type: 'ERROR',
  });
});
