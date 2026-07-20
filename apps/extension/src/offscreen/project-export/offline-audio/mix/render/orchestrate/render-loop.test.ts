import { afterEach, expect, it, vi } from 'vitest';
import { createEffectAudioBufferCache } from '../../../../../../features/video/composition/effect-runtime';

class FakeOfflineAudioContext {
  destination = { id: 'destination' };
  createBufferSource = vi.fn(() => ({
    buffer: null as AudioBuffer | null,
    connect: vi.fn(),
    playbackRate: { value: 1 },
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

function installAudioContextMocks(
  audioContext: FakeAudioContext,
  offlineContext: FakeOfflineAudioContext
): void {
  vi.stubGlobal('OfflineAudioContext', function () {
    return offlineContext;
  });
  vi.stubGlobal('AudioContext', function () {
    return audioContext;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

it('renders clips through the loop and closes the decode context', async () => {
  const decodedBuffer = createAudioBuffer(2, 48_000, 4_800);
  const renderedBuffer = createAudioBuffer(2, 44_100, 9_600);
  const offlineContext = new FakeOfflineAudioContext();
  offlineContext.startRendering.mockResolvedValue(renderedBuffer);
  const audioContext = new FakeAudioContext();
  audioContext.close.mockResolvedValue(undefined);

  installAudioContextMocks(audioContext, offlineContext);
  vi.doMock('../../../clip-audio/index', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../clip-audio/index')>()),
    decodeClipAudioBuffer: vi.fn().mockResolvedValue(decodedBuffer),
  }));

  const { renderOfflineAudioMixLoop } = await import('./render-loop');

  await expect(
    renderOfflineAudioMixLoop({
      clipsWithAudio: [
        {
          duration: 2,
          fadeInMs: 0,
          fadeOutMs: 0,
          muted: false,
          sourceDuration: 2,
          sourceStart: 0,
          startTime: 1,
          volume: 0.5,
        },
      ] as never,
      decodeContext: audioContext as unknown as AudioContext,
      decodedBuffers: createEffectAudioBufferCache<AudioBuffer>(),
      offlineContext: offlineContext as unknown as OfflineAudioContext,
      project: {
        clips: [],
        duration: 3,
        tracks: [],
      } as never,
    })
  ).resolves.toEqual({
    buffer: renderedBuffer,
    settings: { numberOfChannels: 2, sampleRate: 44_100 },
  });

  expect(audioContext.close).toHaveBeenCalledTimes(1);
});

it('aborts the render loop before decoding when the signal is aborted', async () => {
  const offlineContext = new FakeOfflineAudioContext();
  const audioContext = new FakeAudioContext();
  audioContext.close.mockResolvedValue(undefined);

  installAudioContextMocks(audioContext, offlineContext);
  vi.doMock('../../../clip-audio/index', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../clip-audio/index')>()),
    decodeClipAudioBuffer: vi.fn(),
  }));

  const { renderOfflineAudioMixLoop } = await import('./render-loop');
  const controller = new AbortController();
  controller.abort();

  await expect(
    renderOfflineAudioMixLoop({
      clipsWithAudio: [
        {
          duration: 1,
          fadeInMs: 0,
          fadeOutMs: 0,
          muted: false,
          sourceDuration: 1,
          sourceStart: 0,
          startTime: 0,
          volume: 1,
        },
      ] as never,
      decodeContext: audioContext as unknown as AudioContext,
      decodedBuffers: createEffectAudioBufferCache<AudioBuffer>(),
      offlineContext: offlineContext as unknown as OfflineAudioContext,
      project: {
        clips: [],
        duration: 1,
        tracks: [],
      } as never,
      signal: controller.signal,
    })
  ).rejects.toThrow('The export was aborted.');

  expect(audioContext.close).toHaveBeenCalledTimes(1);
  expect(offlineContext.startRendering).not.toHaveBeenCalled();
});
