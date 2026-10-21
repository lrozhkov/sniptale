import { executeOfflineAudioMixRender } from './execute';
import { afterEach, expect, it, vi } from 'vitest';
import { createEffectAudioBufferCache } from '../../../../../../../features/video/composition/effect-runtime';
import { createVideoProjectFromRecording } from '../../../../../../../features/video/project/factories/creation';
const { mixActionAudio } = vi.hoisted(() => ({ mixActionAudio: vi.fn() }));
vi.mock('../../../../action-audio', () => ({ mixProjectActionAudio: mixActionAudio }));

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
  expect(throwIfAborted).toHaveBeenCalledTimes(2);
  expect(offlineContext.startRendering).toHaveBeenCalledTimes(1);
});

it('waits for tempo preparation before rendering and propagates preparation failure', async () => {
  const { args, scheduleOfflineAudioClipMix, offlineContext } =
    createExecuteOfflineAudioMixRenderArgs();
  let reject!: (error: Error) => void;
  scheduleOfflineAudioClipMix.mockImplementation(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      })
  );
  const pending = executeOfflineAudioMixRender(args);
  await vi.waitFor(() => expect(reject).toBeTypeOf('function'));
  expect(offlineContext.startRendering).not.toHaveBeenCalled();
  reject(new Error('cancelled tempo preparation'));
  await expect(pending).rejects.toThrow('cancelled tempo preparation');
  expect(offlineContext.startRendering).not.toHaveBeenCalled();
});
it('awaits physical action PCM before publishing and refuses a failed action mix', async () => {
  const { args, renderedBuffer, buildOfflineAudioMixResult } =
    createExecuteOfflineAudioMixRenderArgs();
  const project = createVideoProjectFromRecording({
    recordingId: 'rec',
    filename: 'rec.webm',
    width: 100,
    height: 100,
    duration: 3,
    mimeType: 'video/webm',
    size: 10,
    recordingSignals: [
      { id: 'typing', kind: 'typing', startTime: 0, endTime: 1, point: null, data: {} },
    ],
  });
  let resolve!: () => void;
  mixActionAudio.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      })
  );
  const signal = new AbortController().signal,
    actionRange = { start: 0.5, end: 1.5 };
  const pending = executeOfflineAudioMixRender({
    ...args,
    project,
    signal,
    actionRange,
    clipsWithAudio: [],
  });
  await vi.waitFor(() =>
    expect(mixActionAudio).toHaveBeenCalledWith(renderedBuffer, project, signal, actionRange)
  );
  expect(buildOfflineAudioMixResult).not.toHaveBeenCalled();
  resolve();
  await expect(pending).resolves.toMatchObject({ buffer: renderedBuffer });
  expect(buildOfflineAudioMixResult).toHaveBeenCalledOnce();
  buildOfflineAudioMixResult.mockClear();
  mixActionAudio.mockRejectedValueOnce(new Error('physical action decode refused'));
  await expect(
    executeOfflineAudioMixRender({ ...args, project, clipsWithAudio: [] })
  ).rejects.toThrow('physical action decode refused');
  expect(buildOfflineAudioMixResult).not.toHaveBeenCalled();
});

it('fades action and clip audio together after mixing on an absolute export range', async () => {
  const fixture = createExecuteOfflineAudioMixRenderArgs();
  const project = createVideoProjectFromRecording({
    recordingId: 'tone',
    filename: 'tone.webm',
    width: 160,
    height: 90,
    duration: 4,
    mimeType: 'video/webm',
    size: 1,
  });
  project.sceneEdges = {
    intro: { enabled: true, duration: 2, audioFade: true },
    outro: { enabled: false, duration: 1 },
  };
  project.actionFeedback = [{} as never];
  mixActionAudio.mockImplementationOnce(async (output: AudioBuffer) => {
    output.getChannelData(0).fill(0.8);
  });
  const result = await executeOfflineAudioMixRender({
    ...fixture.args,
    project,
    actionRange: { start: 1, end: 2 },
  });
  expect(result.buffer.getChannelData(0)[0]).toBeCloseTo(0.4, 6);
  expect(result.buffer.getChannelData(1)[0]).toBeCloseTo(0.25, 6);
  expect(mixActionAudio).toHaveBeenLastCalledWith(result.buffer, project, undefined, {
    start: 1,
    end: 2,
  });
});
