import { vi } from 'vitest';

type MediaRecorderMockInstance = {
  ondataavailable: ((event: { data?: { size: number } }) => void) | null;
  onerror: ((event: { error?: Error }) => void) | null;
  onstop: (() => Promise<void>) | null;
};

let lastMediaRecorderInstance: MediaRecorderMockInstance | null = null;

export function getLastMediaRecorderInstance(): MediaRecorderMockInstance | null {
  return lastMediaRecorderInstance;
}

export function installMediaRecorderMock(supportedMimeTypes: string[]) {
  class MediaRecorderMock {
    static isTypeSupported = vi.fn((mimeType: string) => supportedMimeTypes.includes(mimeType));

    ondataavailable = null;
    onerror = null;
    onstop = null;
    start = vi.fn();
    stop = vi.fn();

    constructor(_stream: MediaStream, _config: object) {
      lastMediaRecorderInstance = this as unknown as MediaRecorderMockInstance;
    }
  }

  Object.assign(globalThis, {
    MediaRecorder: MediaRecorderMock,
  });
}

export function createVideoStream() {
  return {
    getAudioTracks: () => [],
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
}
