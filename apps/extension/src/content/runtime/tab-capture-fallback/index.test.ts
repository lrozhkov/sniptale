import { beforeEach, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { createTabCaptureSession } from '.';
import type { CaptureProgress, TabCaptureSettings } from './types';

class FakeMediaStreamTrack extends EventTarget implements MediaStreamTrack {
  contentHint = '';
  enabled = true;
  id = 'track';
  kind = 'video';
  label = 'Fake track';
  muted = false;
  onended: ((this: MediaStreamTrack, event: Event) => unknown) | null = null;
  onmute: ((this: MediaStreamTrack, event: Event) => unknown) | null = null;
  onunmute: ((this: MediaStreamTrack, event: Event) => unknown) | null = null;
  readyState: MediaStreamTrackState = 'live';
  stop = vi.fn();

  applyConstraints(): Promise<void> {
    return Promise.resolve();
  }
  clone(): MediaStreamTrack {
    return new FakeMediaStreamTrack();
  }
  getCapabilities(): MediaTrackCapabilities {
    return {};
  }
  getConstraints(): MediaTrackConstraints {
    return {};
  }
  getSettings(): MediaTrackSettings {
    return {};
  }
}

class FakeMediaStream extends EventTarget implements MediaStream {
  active = true;
  id = 'stream';
  onaddtrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;
  onremovetrack: ((this: MediaStream, event: MediaStreamTrackEvent) => unknown) | null = null;
  private readonly tracks: MediaStreamTrack[];

  constructor(stopCount = 0) {
    super();
    this.tracks = Array.from({ length: stopCount }, () => new FakeMediaStreamTrack());
  }

  addTrack() {}
  clone(): MediaStream {
    return new FakeMediaStream(this.tracks.length);
  }
  getAudioTracks(): MediaStreamAudioTrack[] {
    return [];
  }
  getTrackById(): MediaStreamTrack | null {
    return null;
  }
  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
  getVideoTracks(): MediaStreamVideoTrack[] {
    return [];
  }
  removeTrack() {}
}

class FakeMediaRecorder extends EventTarget implements MediaRecorder {
  audioBitsPerSecond = 0;
  mimeType = 'video/webm';
  ondataavailable: ((this: MediaRecorder, event: BlobEvent) => unknown) | null = null;
  onerror: ((this: MediaRecorder, event: Event) => unknown) | null = null;
  onpause: ((this: MediaRecorder, event: Event) => unknown) | null = null;
  onresume: ((this: MediaRecorder, event: Event) => unknown) | null = null;
  onstart: ((this: MediaRecorder, event: Event) => unknown) | null = null;
  onstop: ((this: MediaRecorder, event: Event) => unknown) | null = null;
  pause = vi.fn();
  requestData = vi.fn();
  resume = vi.fn();
  start = vi.fn();
  state: RecordingState = 'inactive';
  stop = vi.fn();
  stream: MediaStream = new FakeMediaStream();
  videoBitsPerSecond = 0;
}

function createSettings(): TabCaptureSettings {
  return {
    quality: VideoQuality.MEDIUM,
    streamId: 'stream-id',
    systemAudioEnabled: true,
    microphoneEnabled: true,
  };
}

function createRecorder() {
  return new FakeMediaRecorder();
}

function createMediaStreamWithTracks(stopCount = 0) {
  return new FakeMediaStream(stopCount);
}

function createTabCaptureController(
  overrides: Partial<Parameters<typeof createTabCaptureSession>[0]> = {}
) {
  return createTabCaptureSession({
    saveRecording: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('starts the recorder with resolved streams and reuses the existing progress contract', async () => {
  const stream = createMediaStreamWithTracks();
  const recorder = createRecorder();
  const onProgress = vi.fn();
  const session = createTabCaptureController({
    configureRecorder: vi.fn(() => recorder),
    resolveCaptureStream: vi.fn().mockResolvedValue({
      stream,
      micStream: stream,
    }),
  });

  await session.start(createSettings(), onProgress);

  expect(recorder.start).toHaveBeenCalledWith(1000);
  expect(onProgress).toHaveBeenCalledWith({ type: 'STARTED' });
});

it('stops the recorder and cleans up streams after the delayed teardown', async () => {
  vi.useFakeTimers();
  const stream = createMediaStreamWithTracks(2);
  const recorder = createRecorder();
  const cleanupResources = vi.fn();
  const mixingAudioContext = {
    close: vi.fn().mockResolvedValue(undefined),
  };
  const session = createTabCaptureController({
    cleanupResources,
    configureRecorder: vi.fn(() => recorder),
    resolveCaptureStream: vi.fn().mockResolvedValue({
      audioContext: mixingAudioContext,
      stream,
      micStream: stream,
    }),
  });

  await session.start(createSettings(), vi.fn());
  session.stop();

  expect(recorder.stop).toHaveBeenCalledOnce();
  expect(cleanupResources).not.toHaveBeenCalled();

  vi.runAllTimers();
  expect(cleanupResources).toHaveBeenCalledWith({
    audioContext: mixingAudioContext,
    currentStream: stream,
    micStream: stream,
  });
});

it('reports the existing error payload when stream resolution fails', async () => {
  const onProgress = vi.fn();
  const session = createTabCaptureController({
    resolveCaptureStream: vi.fn().mockRejectedValue(new Error('boom')),
  });

  await expect(session.start(createSettings(), onProgress)).rejects.toThrow('boom');
  expect(onProgress).toHaveBeenCalledWith({
    type: 'ERROR',
    error: 'boom',
  } satisfies CaptureProgress);
});
