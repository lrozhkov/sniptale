import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';

import {
  createMixedCaptureStream,
  createRecorderHandlers,
  resolveRecorderOptions,
} from './helpers';

function createSettings() {
  return {
    quality: VideoQuality.MEDIUM,
    streamId: 'stream-id',
    systemAudioEnabled: true,
    microphoneEnabled: true,
  };
}

class FakeMediaStream extends EventTarget {
  active = true;
  id = 'fake-media-stream';
  onaddtrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;
  onremovetrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;
  private readonly tracks: unknown[];

  constructor(tracks: unknown[]) {
    super();
    this.tracks = tracks;
  }

  addTrack() {}
  clone() {
    return new FakeMediaStream(this.tracks);
  }
  getAudioTracks() {
    return this.tracks.filter((track) => (track as { kind?: string }).kind === 'audio');
  }
  getTrackById() {
    return null;
  }
  getTracks() {
    return this.tracks;
  }

  getVideoTracks() {
    return this.tracks.filter((track) => (track as { kind?: string }).kind === 'video');
  }
  removeTrack() {}
}

function createCaptureStream(videoTrack = { kind: 'video' }, audioTracks: unknown[] = []) {
  return new FakeMediaStream([videoTrack, ...audioTracks]) as MediaStream;
}

function installMixedAudioHarness() {
  const audioTrack = { kind: 'audio' };
  const videoTrack = { kind: 'video' };
  const micAudioTrack = { kind: 'audio' };
  const destinationAudioTrack = { kind: 'audio' };
  const systemConnect = vi.fn();
  const micConnect = vi.fn();
  const micStream = createCaptureStream(undefined, [micAudioTrack]);
  const destinationStream = new FakeMediaStream([destinationAudioTrack]) as MediaStream;
  const captureStream = createCaptureStream(videoTrack, [audioTrack]);
  const getUserMedia = vi.fn().mockResolvedValue(micStream);

  class FakeAudioContext {
    createMediaStreamDestination() {
      return { stream: destinationStream };
    }

    createMediaStreamSource(stream: MediaStream) {
      return {
        connect: stream === micStream ? micConnect : systemConnect,
      };
    }
  }

  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia,
    },
  });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('MediaStream', FakeMediaStream);

  return {
    captureStream,
    destinationAudioTrack,
    micConnect,
    micStream,
    systemConnect,
    videoTrack,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function verifyDisabledMicrophoneKeepsCaptureStream() {
  const captureStream = createCaptureStream();

  await expect(
    createMixedCaptureStream({
      captureStream,
      microphoneEnabled: false,
      systemAudioEnabled: true,
    })
  ).resolves.toEqual({
    audioContext: null,
    micStream: null,
    stream: captureStream,
  });
}

async function verifySystemAndMicrophoneAudioMixing() {
  const { captureStream, destinationAudioTrack, micConnect, micStream, systemConnect, videoTrack } =
    installMixedAudioHarness();

  const result = await createMixedCaptureStream({
    captureStream,
    microphoneEnabled: true,
    systemAudioEnabled: true,
  });

  expect(result.micStream).toBe(micStream);
  expect(result.stream.getVideoTracks()).toEqual([videoTrack]);
  expect(result.stream.getAudioTracks()).toEqual([destinationAudioTrack]);
  expect(systemConnect).toHaveBeenCalledOnce();
  expect(micConnect).toHaveBeenCalledOnce();
}

async function verifyMicrophoneMixingWithoutSystemAudioTrack() {
  const { destinationAudioTrack, micConnect, micStream, systemConnect, videoTrack } =
    installMixedAudioHarness();
  const silentCaptureStream = createCaptureStream(videoTrack, []);

  const result = await createMixedCaptureStream({
    captureStream: silentCaptureStream,
    microphoneEnabled: true,
    systemAudioEnabled: true,
  });

  expect(result.micStream).toBe(micStream);
  expect(result.stream.getVideoTracks()).toEqual([videoTrack]);
  expect(result.stream.getAudioTracks()).toEqual([destinationAudioTrack]);
  expect(systemConnect).not.toHaveBeenCalled();
  expect(micConnect).toHaveBeenCalledOnce();
}

describe('tab-capture-fallback capture mixing', () => {
  it(
    'returns the capture stream unchanged when microphone capture is disabled',
    verifyDisabledMicrophoneKeepsCaptureStream
  );

  it(
    'mixes system audio and microphone audio into a combined stream',
    verifySystemAndMicrophoneAudioMixing
  );

  it(
    'mixes microphone audio even when the capture stream has no system audio track',
    verifyMicrophoneMixingWithoutSystemAudioTrack
  );
});

describe('tab-capture-fallback recorder event helpers', () => {
  it('pushes chunk progress and triggers save on stop', () => {
    const recordedChunks: Blob[] = [];
    const onProgress = vi.fn();
    const onSaveRecording = vi.fn();
    const handlers = createRecorderHandlers({
      onProgress,
      onSaveRecording,
      recordedChunks,
    });

    handlers.ondataavailable({
      data: new Blob(['video-data'], { type: 'video/webm' }),
    } as BlobEvent);
    handlers.onstop();

    expect(recordedChunks).toHaveLength(1);
    expect(onProgress).toHaveBeenCalledWith({
      type: 'CHUNK',
      size: recordedChunks[0]?.size,
    });
    expect(onSaveRecording).toHaveBeenCalledOnce();
  });

  it('reports recorder errors through the progress channel', () => {
    const onProgress = vi.fn();
    const handlers = createRecorderHandlers({
      onProgress,
      onSaveRecording: vi.fn(),
      recordedChunks: [],
    });

    handlers.onerror(new Error('recorder failed'));

    expect(onProgress).toHaveBeenCalledWith({
      type: 'ERROR',
      error: 'recorder failed',
    });
  });
});

describe('tab-capture-fallback recorder mime types', () => {
  it('resolves recorder options through the configured quality profile', () => {
    const isTypeSupported = vi.fn((value: string) => value === 'video/webm');
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported,
    });

    expect(resolveRecorderOptions(createSettings())).toEqual({
      mimeType: 'video/webm',
      qualityConfig: VIDEO_QUALITY_CONFIGS[VideoQuality.MEDIUM],
    });

    expect(isTypeSupported).toHaveBeenCalled();
  });

  it('keeps the quality-specific mime type when the browser supports it directly', () => {
    const isTypeSupported = vi.fn(
      (value: string) => value === VIDEO_QUALITY_CONFIGS[VideoQuality.MEDIUM].mimeType
    );
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported,
    });

    expect(resolveRecorderOptions(createSettings()).mimeType).toBe(
      VIDEO_QUALITY_CONFIGS[VideoQuality.MEDIUM].mimeType
    );
  });
});
