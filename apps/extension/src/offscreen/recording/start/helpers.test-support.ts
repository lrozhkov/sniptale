import { vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

type MediaRecorderMockInstance = {
  config: { mimeType: string; videoBitsPerSecond: number };
  ondataavailable: ((event: { data?: Blob | null }) => void) | null;
  onerror: ((event: Event & { error?: unknown }) => void) | null;
  onstop: (() => Promise<void>) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  state: 'inactive' | 'recording';
};

export const mediaRecorderTestState: { lastInstance: MediaRecorderMockInstance | null } = {
  lastInstance: null,
};

export function installMediaRecorderMock(isTypeSupported: boolean) {
  class MediaRecorderMock {
    static isTypeSupported = vi.fn(() => isTypeSupported);

    ondataavailable: ((event: { data?: Blob | null }) => void) | null = null;
    onerror: ((event: Event & { error?: unknown }) => void) | null = null;
    onstop: (() => Promise<void>) | null = null;
    start = vi.fn(() => {
      this.state = 'recording';
    });
    stop = vi.fn(() => {
      this.state = 'inactive';
    });
    state: 'inactive' | 'recording' = 'inactive';
    mimeType: string;

    constructor(
      _stream: MediaStream,
      readonly config: { mimeType: string; videoBitsPerSecond: number }
    ) {
      this.mimeType = config.mimeType;
      mediaRecorderTestState.lastInstance = this as unknown as MediaRecorderMockInstance;
    }
  }

  Object.assign(globalThis, {
    MediaRecorder: MediaRecorderMock,
  });
}

export function createTrack(stop: () => void = vi.fn()) {
  return { stop };
}

export function createVideoStream(params?: { audioTrackCount?: number; trackStop?: () => void }) {
  const trackStop = params?.trackStop ?? vi.fn();
  const audioTracks = Array.from({ length: params?.audioTrackCount ?? 0 }, () => ({
    kind: 'audio' as const,
  }));

  return {
    getTracks: () => [createTrack(trackStop)],
    getAudioTracks: () => audioTracks,
  } as unknown as MediaStream;
}

export function createSettings(quality: VideoQuality | undefined = VideoQuality.HIGH) {
  return { quality } as never;
}
