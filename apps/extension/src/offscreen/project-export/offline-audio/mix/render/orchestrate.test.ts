import { afterEach, expect, it, vi } from 'vitest';

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
  vi.doMock('../../clip-audio/index', () => ({
    collectRenderableAudioClips: () => clips,
    decodeClipAudioBuffer: vi.fn().mockResolvedValue(decodedBuffer),
  }));

  const renderModule = await import('./orchestrate');
  return renderModule;
}

async function createRampCoverageRuntime() {
  const decodedBuffer = createAudioBuffer(2, 48_000, 4_800);
  const renderedBuffer = createAudioBuffer(2, 48_000, 4_800);
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

  const { renderOfflineAudioMix } = await importMixWithClipAudioMock({
    clips: [
      {
        duration: 2,
        fadeInMs: 300,
        fadeOutMs: 400,
        muted: false,
        sourceDuration: 2,
        sourceStart: 0.5,
        startTime: 1,
        volume: 0.75,
      },
      {
        duration: 1,
        fadeInMs: 200,
        fadeOutMs: 200,
        muted: true,
        sourceDuration: 1,
        sourceStart: 0,
        startTime: 0,
        volume: 1,
      },
    ],
    decodedBuffer,
  });

  return { audioContext, offlineContext, renderOfflineAudioMix, renderedBuffer };
}

it('returns null when the project has no renderable audio clips', async () => {
  const { renderOfflineAudioMix } = await importMixWithClipAudioMock({
    clips: [],
    decodedBuffer: createAudioBuffer(2, 48_000, 4_800),
  });
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
  const { renderOfflineAudioMix } = await importMixWithClipAudioMock({
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
  expect(offlineContext.createBufferSource).toHaveBeenCalledTimes(1);
  expect(offlineContext.createGain).toHaveBeenCalledTimes(1);
  expect(offlineContext.startRendering).toHaveBeenCalledTimes(1);
});

it('applies fade ramps for audible clips and skips them for muted clips', async () => {
  const { offlineContext, renderOfflineAudioMix, renderedBuffer } =
    await createRampCoverageRuntime();

  await expect(
    renderOfflineAudioMix(
      {
        duration: 4,
        tracks: [],
      } as never,
      undefined
    )
  ).resolves.toEqual({
    buffer: renderedBuffer,
    settings: { numberOfChannels: 2, sampleRate: 48_000 },
  });

  const firstGain = offlineContext.createGain.mock.results[0]?.value?.gain;
  const secondGain = offlineContext.createGain.mock.results[1]?.value?.gain;

  expect(firstGain?.linearRampToValueAtTime).toHaveBeenCalledWith(0.75, 1.3);
  expect(firstGain?.linearRampToValueAtTime).toHaveBeenCalledWith(0, 3);
  expect(secondGain?.linearRampToValueAtTime).not.toHaveBeenCalled();
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
