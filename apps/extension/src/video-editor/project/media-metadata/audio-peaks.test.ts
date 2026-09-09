// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import {
  AUDIO_PEAK_MAX_DECODE_BLOB_SIZE,
  AUDIO_PEAK_MAX_DECODE_DURATION_SECONDS,
  loadAudioPeaks,
} from './audio-peaks';

const streaming = vi.hoisted(() => vi.fn(async () => null));
vi.mock('./audio-peaks-stream', () => ({ loadStreamingAudioPeaks: streaming }));

const originalAudioContext = window.AudioContext;

afterEach(() => {
  vi.restoreAllMocks();
  streaming.mockClear();
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: originalAudioContext,
  });
});

it('streams oversized blobs without full-buffer allocation', async () => {
  const blob = new Blob([], { type: 'audio/mpeg' });
  const readBytes = vi.fn();
  const contextConstructed = vi.fn();
  class AudioContextMock {
    constructor() {
      contextConstructed();
    }
  }

  Object.defineProperty(blob, 'arrayBuffer', {
    configurable: true,
    value: readBytes,
  });
  Object.defineProperty(blob, 'size', {
    configurable: true,
    value: AUDIO_PEAK_MAX_DECODE_BLOB_SIZE + 1,
  });
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: AudioContextMock,
  });

  await expect(loadAudioPeaks(blob, 10)).resolves.toBeNull();
  expect(readBytes).not.toHaveBeenCalled();
  expect(contextConstructed).not.toHaveBeenCalled();
  expect(streaming).toHaveBeenCalledOnce();
});

it('streams long media without full-buffer allocation', async () => {
  const blob = new Blob([], { type: 'audio/mpeg' });
  const readBytes = vi.fn();
  const contextConstructed = vi.fn();
  class AudioContextMock {
    constructor() {
      contextConstructed();
    }
  }

  Object.defineProperty(blob, 'arrayBuffer', {
    configurable: true,
    value: readBytes,
  });
  Object.defineProperty(blob, 'size', {
    configurable: true,
    value: AUDIO_PEAK_MAX_DECODE_BLOB_SIZE - 1,
  });
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: AudioContextMock,
  });

  await expect(
    loadAudioPeaks(blob, AUDIO_PEAK_MAX_DECODE_DURATION_SECONDS + 1)
  ).resolves.toBeNull();
  expect(readBytes).not.toHaveBeenCalled();
  expect(contextConstructed).not.toHaveBeenCalled();
  expect(streaming).toHaveBeenCalledOnce();
});

it('decodes bounded audio peaks without duplicating the blob buffer', async () => {
  const sourceBuffer = new ArrayBuffer(4);
  const blob = new Blob(['data'], { type: 'audio/mpeg' });
  const readBytes = vi.fn().mockResolvedValue(sourceBuffer);
  const audioContext = createAudioContextSpies();
  class AudioContextMock {
    close = audioContext.close;
    decodeAudioData = audioContext.decodeAudioData;
  }

  Object.defineProperty(blob, 'arrayBuffer', {
    configurable: true,
    value: readBytes,
  });
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: AudioContextMock,
  });

  const peaks = await loadAudioPeaks(blob, 12);

  expect(readBytes).toHaveBeenCalledTimes(1);
  expect(audioContext.decodeAudioData.mock.calls[0]?.[0]).toBe(sourceBuffer);
  expect(audioContext.close).toHaveBeenCalledTimes(1);
  expect(peaks).toHaveLength(320);
  expect(Math.max(...(peaks ?? []))).toBeCloseTo(0.75);
});

function createAudioContextSpies() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn().mockResolvedValue(createAudioBuffer()),
  };
}

function createAudioBuffer(): Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'getChannelData'> {
  const channel = new Float32Array(320);

  channel[0] = 0.1;
  channel[159] = -0.75;
  channel[319] = 0.5;

  return {
    getChannelData: () => channel,
    length: channel.length,
    numberOfChannels: 1,
  };
}

it('preserves a short transient between sampled strides and retains silent windows', async () => {
  const channel = new Float32Array(48000 * 2);
  channel[301] = 0.8;
  class AudioContextMock {
    decodeAudioData = async () => ({
      length: channel.length,
      numberOfChannels: 1,
      duration: 2,
      getChannelData: () => channel,
    });
    close = async () => undefined;
  }
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: AudioContextMock });
  const blob = new Blob(['audio']);
  Object.defineProperty(blob, 'arrayBuffer', { value: async () => new ArrayBuffer(1) });
  const peaks = await loadAudioPeaks(blob, 2);
  expect(peaks).toHaveLength(200);
  expect(Math.max(...peaks!)).toBeCloseTo(0.8);
  expect(peaks!.slice(100).every((value) => value === 0)).toBe(true);
});
