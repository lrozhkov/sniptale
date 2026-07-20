import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

const helpersMock = vi.hoisted(() => ({
  createMixedCaptureStream: vi.fn(),
  createRecorderHandlers: vi.fn(),
  resolveRecorderOptions: vi.fn(),
}));

vi.mock('./helpers', () => helpersMock);

import { configureTabCaptureRecorder, resolveFinalCaptureStream } from './stream';

class FakeMediaStream extends EventTarget {
  active = true;
  id = 'capture-stream';
  onaddtrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;
  onremovetrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;

  addTrack() {}
  clone() {
    return new FakeMediaStream();
  }
  getAudioTracks() {
    return [];
  }
  getTrackById() {
    return null;
  }
  getTracks() {
    return [];
  }
  getVideoTracks() {
    return [];
  }
  removeTrack() {}
}

function createFakeMediaStream(): MediaStream {
  return new FakeMediaStream() as MediaStream;
}

function createSettings() {
  return {
    quality: VideoQuality.MEDIUM,
    streamId: 'stream-id',
    systemAudioEnabled: true,
    microphoneEnabled: true,
  };
}

beforeEach(() => {
  helpersMock.createMixedCaptureStream.mockReset();
  helpersMock.createRecorderHandlers.mockReset();
  helpersMock.resolveRecorderOptions.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tab-capture-fallback stream resolution', () => {
  it('returns the capture stream directly when microphone capture is disabled', async () => {
    const captureStream = createFakeMediaStream();
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(captureStream),
      },
    });

    await expect(
      resolveFinalCaptureStream({
        ...createSettings(),
        microphoneEnabled: false,
      })
    ).resolves.toEqual({
      audioContext: null,
      micStream: null,
      stream: captureStream,
    });
  });

  it('falls back to the capture stream when microphone mixing fails', async () => {
    const captureStream = createFakeMediaStream();
    helpersMock.createMixedCaptureStream.mockRejectedValue(new Error('mic denied'));
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(captureStream),
      },
    });

    await expect(resolveFinalCaptureStream(createSettings())).resolves.toEqual({
      audioContext: null,
      micStream: null,
      stream: captureStream,
    });
  });
});

describe('tab-capture-fallback recorder configuration', () => {
  it('wires MediaRecorder handlers and resolved options into the recorder instance', () => {
    const constructorSpy = vi.fn();
    class FakeMediaRecorder {
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onstop: (() => void) | null = null;

      constructor(stream: MediaStream, options: MediaRecorderOptions) {
        constructorSpy(stream, options);
      }
    }
    const handlers = {
      ondataavailable: vi.fn(),
      onerror: vi.fn(),
      onstop: vi.fn(),
    };
    helpersMock.resolveRecorderOptions.mockReturnValue({
      mimeType: 'video/webm',
      qualityConfig: {
        frameRate: 30,
        mimeType: 'video/webm',
        videoBitsPerSecond: 1_000_000,
      },
    });
    helpersMock.createRecorderHandlers.mockReturnValue(handlers);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder as typeof MediaRecorder);

    const configured = configureTabCaptureRecorder({
      settings: createSettings(),
      stream: createFakeMediaStream(),
      onProgress: vi.fn(),
      onSaveRecording: vi.fn(),
      recordedChunks: [],
    });

    expect(configured).toBeInstanceOf(FakeMediaRecorder);
    expect(constructorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mimeType: 'video/webm',
        videoBitsPerSecond: 1_000_000,
      })
    );
    expect(configured.ondataavailable).toBe(handlers.ondataavailable);
    expect(configured.onerror).toBe(handlers.onerror);
    expect(configured.onstop).toBe(handlers.onstop);
  });
});
