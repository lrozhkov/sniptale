// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  addVideoTrack: vi.fn(),
  cancel: vi.fn(),
  finalize: vi.fn(),
  formatOptions: [] as unknown[],
  start: vi.fn(),
}));

vi.mock('mediabunny', () => {
  class BufferTarget {
    buffer: ArrayBuffer | null = new Uint8Array([1, 2, 3]).buffer;
  }
  class CanvasSource {
    add = mocks.add;

    constructor(
      _canvas: HTMLCanvasElement,
      options: { onEncoderConfig(config: { codec: string }): void }
    ) {
      options.onEncoderConfig({ codec: 'avc1.640033' });
    }
  }
  class Mp4OutputFormat {
    constructor(options: unknown) {
      mocks.formatOptions.push(options);
    }
  }
  class Output {
    addVideoTrack = mocks.addVideoTrack;
    cancel = mocks.cancel;
    finalize = mocks.finalize;
    start = mocks.start;
  }
  return {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    QUALITY_MEDIUM: 1,
    canEncodeVideo: vi.fn(() => Promise.resolve(true)),
  };
});

import { encodePersistentVideoPreview } from './encode';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.formatOptions.length = 0;
  mocks.add.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue(undefined);
  mocks.finalize.mockResolvedValue(undefined);
});

it('encodes fragmented AVC with a forced keyframe at each half-second boundary', async () => {
  const result = await encodePersistentVideoPreview({
    canvas: document.createElement('canvas'),
    endFrame: 3,
    fps: 4,
    onFrame: vi.fn(() => Promise.resolve()),
    signal: new AbortController().signal,
    startFrame: 0,
  });

  expect(mocks.formatOptions).toEqual([{ fastStart: 'fragmented', minimumFragmentDuration: 0.5 }]);
  expect(mocks.add.mock.calls.map((call) => call[2])).toEqual([
    { keyFrame: true },
    { keyFrame: false },
    { keyFrame: true },
  ]);
  expect(result.blob.type).toBe('video/mp4');
  expect(result.codec).toBe('avc1.640033');
});
