import { vi } from 'vitest';

type MediaRecorderMockInstance = {
  ondataavailable: ((event: { data?: { size: number } }) => void) | null;
  onerror: ((event: { error?: Error }) => void) | null;
  onstart: (() => void) | null;
  onstop: (() => Promise<void>) | null;
  start: ReturnType<typeof vi.fn>;
};

let lastMediaRecorderInstance: MediaRecorderMockInstance | null = null;

export function getLastMediaRecorderInstance(): MediaRecorderMockInstance | null {
  return lastMediaRecorderInstance;
}

export function installMediaRecorderMock(
  supportedMimeTypes: string[],
  options: { emitStartEvent?: boolean } = {}
) {
  class MediaRecorderMock {
    static isTypeSupported = vi.fn((mimeType: string) => supportedMimeTypes.includes(mimeType));

    ondataavailable = null;
    onerror = null;
    onstart: (() => void) | null = null;
    onstop = null;
    start = vi.fn(() => {
      if (options.emitStartEvent !== false) {
        this.onstart?.();
      }
    });
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
