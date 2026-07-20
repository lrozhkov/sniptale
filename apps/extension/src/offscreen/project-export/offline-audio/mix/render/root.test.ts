import { afterEach, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function importMixWithClipAudioMock({
  clips,
  decodedBuffer,
}: {
  clips: unknown[];
  decodedBuffer: AudioBuffer;
}) {
  const scheduleOfflineAudioClipMix = vi.fn();
  vi.doMock('../../clip-audio/index', () => ({
    collectRenderableAudioClips: () => clips,
    decodeClipAudioBuffer: vi.fn().mockResolvedValue(decodedBuffer),
  }));
  vi.doMock('../schedule', () => ({
    scheduleOfflineAudioClipMix,
  }));

  const renderModule = await import('./index');
  return {
    ...renderModule,
    scheduleOfflineAudioClipMix,
  };
}

it('aborts renderOfflineAudioMix when there are no audio clips', async () => {
  const { renderOfflineAudioMix } = await import('./index');
  const project = {
    clips: [],
    duration: 2,
    tracks: [],
  };

  await expect(renderOfflineAudioMix(project as never)).resolves.toBeNull();
});

it('renders an offline mix and returns buffer settings', async () => {
  const decodedBuffer = createAudioBuffer(2, 48_000, 4_800);
  const renderedBuffer = createAudioBuffer(2, 44_100, 9_600);
  const offlineContext = new FakeOfflineAudioContext();
  offlineContext.startRendering.mockResolvedValue(renderedBuffer);
  const audioContext = new FakeAudioContext();
  audioContext.close.mockResolvedValue(undefined);
  function OfflineAudioContextStub() {
    return offlineContext;
  }
  function AudioContextStub() {
    return audioContext;
  }
  vi.stubGlobal(
    'OfflineAudioContext',
    OfflineAudioContextStub as unknown as typeof OfflineAudioContext
  );
  vi.stubGlobal('AudioContext', AudioContextStub as unknown as typeof AudioContext);
  const { renderOfflineAudioMix, scheduleOfflineAudioClipMix } = await importMixWithClipAudioMock({
    clips: [
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
    ],
    decodedBuffer,
  });

  await expect(renderOfflineAudioMix({ duration: 3 } as never)).resolves.toEqual({
    buffer: renderedBuffer,
    settings: { numberOfChannels: 2, sampleRate: 44_100 },
  });
  expect(audioContext.close).toHaveBeenCalledTimes(1);
  expect(offlineContext.startRendering).toHaveBeenCalledTimes(1);
  expect(scheduleOfflineAudioClipMix).toHaveBeenCalledWith(
    offlineContext,
    expect.objectContaining({
      duration: 2,
      startTime: 1,
      volume: 0.5,
    }),
    decodedBuffer
  );
});

it('aborts an offline mix when the signal is already aborted and ignores close errors', async () => {
  const decodedBuffer = createAudioBuffer(2, 48_000, 4_800);
  const offlineContext = new FakeOfflineAudioContext();
  const audioContext = new FakeAudioContext();
  audioContext.close.mockRejectedValue(new Error('close failed'));
  function OfflineAudioContextStub() {
    return offlineContext;
  }
  function AudioContextStub() {
    return audioContext;
  }
  vi.stubGlobal(
    'OfflineAudioContext',
    OfflineAudioContextStub as unknown as typeof OfflineAudioContext
  );
  vi.stubGlobal('AudioContext', AudioContextStub as unknown as typeof AudioContext);
  const { renderOfflineAudioMix } = await importMixWithClipAudioMock({
    clips: [
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
    ],
    decodedBuffer,
  });
  const controller = new AbortController();
  controller.abort();

  await expect(renderOfflineAudioMix({ duration: 1 } as never, controller.signal)).rejects.toThrow(
    'The export was aborted.'
  );
  expect(audioContext.close).toHaveBeenCalledTimes(1);
  expect(offlineContext.startRendering).not.toHaveBeenCalled();
});
