import { afterEach, expect, it, vi } from 'vitest';
import { createEffectAudioBufferCache } from '../../../../../../../features/video/composition/effect-runtime';

class FakeOfflineAudioContext {
  destination = { id: 'destination' };
  createBufferSource = vi.fn(() => ({
    buffer: null as AudioBuffer | null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  createGain = vi.fn(() => ({
    connect: vi.fn(),
    gain: {
      linearRampToValueAtTime: vi.fn(),
      setValueAtTime: vi.fn(),
    },
  }));
  startRendering = vi.fn();
}

class FakeAudioContext {
  close = vi.fn();
}

function createAudioBuffer(channels: number, sampleRate: number, length: number) {
  const channelData = Array.from({ length: channels }, () => new Float32Array(length).fill(0.5));
  return {
    length,
    numberOfChannels: channels,
    sampleRate,
    getChannelData: (channel: number) => channelData[channel],
  } as AudioBuffer;
}

const DEFAULT_CLIP = {
  duration: 2,
  fadeInMs: 0,
  fadeOutMs: 0,
  muted: false,
  sourceDuration: 2,
  sourceStart: 0,
  startTime: 1,
  volume: 0.5,
} as const;

const DEFAULT_PROJECT = {
  clips: [],
  duration: 3,
  tracks: [],
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

function createExecuteOfflineAudioMixRenderArgs() {
  const decodedBuffer = createAudioBuffer(2, 48_000, 4_800);
  const renderedBuffer = createAudioBuffer(2, 44_100, 9_600);
  const offlineContext = new FakeOfflineAudioContext();
  offlineContext.startRendering.mockResolvedValue(renderedBuffer);
  const audioContext = new FakeAudioContext();
  audioContext.close.mockResolvedValue(undefined);

  vi.stubGlobal('OfflineAudioContext', function () {
    return offlineContext;
  } as unknown as typeof OfflineAudioContext);
  vi.stubGlobal('AudioContext', function () {
    return audioContext;
  } as unknown as typeof AudioContext);

  const decodeClipAudioBuffer = vi.fn().mockResolvedValue(decodedBuffer);
  const scheduleOfflineAudioClipMix = vi.fn();
  const buildOfflineAudioMixResult = vi.fn((rendered: AudioBuffer) => ({
    buffer: rendered,
    settings: {
      numberOfChannels: rendered.numberOfChannels,
      sampleRate: rendered.sampleRate,
    },
  }));
  const throwIfAborted = vi.fn();

  return {
    args: {
      buildOfflineAudioMixResult,
      clipsWithAudio: [DEFAULT_CLIP] as never,
      decodeContext: audioContext as unknown as AudioContext,
      decodeClipAudioBuffer,
      decodedBuffers: createEffectAudioBufferCache<AudioBuffer>(),
      offlineContext: offlineContext as unknown as OfflineAudioContext,
      project: DEFAULT_PROJECT as never,
      scheduleOfflineAudioClipMix,
      throwIfAborted,
    },
    audioContext,
    buildOfflineAudioMixResult,
    decodeClipAudioBuffer,
    offlineContext,
    renderedBuffer,
    scheduleOfflineAudioClipMix,
    throwIfAborted,
  };
}

it('renders the mix loop and closes the decode context in the caller', async () => {
  const { executeOfflineAudioMixRender } = await import('./execute');
  const {
    args,
    audioContext,
    buildOfflineAudioMixResult,
    decodeClipAudioBuffer,
    offlineContext,
    renderedBuffer,
    scheduleOfflineAudioClipMix,
    throwIfAborted,
  } = createExecuteOfflineAudioMixRenderArgs();

  await expect(executeOfflineAudioMixRender(args)).resolves.toEqual({
    buffer: renderedBuffer,
    settings: { numberOfChannels: 2, sampleRate: 44_100 },
  });

  expect(audioContext.close).toHaveBeenCalledTimes(0);
  expect(decodeClipAudioBuffer).toHaveBeenCalledTimes(1);
  expect(scheduleOfflineAudioClipMix).toHaveBeenCalledTimes(1);
  expect(buildOfflineAudioMixResult).toHaveBeenCalledWith(renderedBuffer);
  expect(throwIfAborted).toHaveBeenCalledTimes(1);
  expect(offlineContext.startRendering).toHaveBeenCalledTimes(1);
});
