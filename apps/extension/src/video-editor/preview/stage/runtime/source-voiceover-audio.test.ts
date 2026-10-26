import { expect, it, vi } from 'vitest';
import type {
  ReviewAudioEngine,
  ReviewAudioClipBuffer,
} from '../../../../workflows/video-review/audio-playback-engine';
import type {
  QuickEditAudioPlanEntry,
  QuickEditClipSchedule,
} from '../../../../features/video/review/advanced/audio-plan';
import { createProjectSourceVoiceoverAudioRuntime } from './source-voiceover-audio';

class Engine implements ReviewAudioEngine {
  clock = 100;
  now() {
    return this.clock;
  }
  resume = vi.fn(async () => undefined);
  decode = vi.fn(async (): Promise<ReviewAudioClipBuffer> => ({ duration: 20 }));
  prepareClip = vi.fn(
    async (
      _buffer: ReviewAudioClipBuffer,
      entry: QuickEditAudioPlanEntry,
      _signal: AbortSignal
    ): Promise<ReviewAudioClipBuffer> => ({ duration: entry.duration })
  );
  scheduleClip = vi.fn((_schedule: QuickEditClipSchedule, _buffer: ReviewAudioClipBuffer) => ({
    stop: vi.fn(),
  }));
  setOriginalGain = vi.fn();
  setOutputGain = vi.fn();
  stopAll = vi.fn();
  dispose = vi.fn();
}
const entry: QuickEditAudioPlanEntry = {
  lane: 'voiceover',
  clipId: 'take',
  source: { kind: 'project', assetId: 'voice' },
  timelineStart: 1,
  duration: 4,
  sourceOffset: 0.37,
  volume: 0.8,
  fadeIn: 0.3,
  fadeOut: 0.6,
  playbackRate: 2,
  fadePhase: { offset: 0.2, duration: 9 },
};
const input = () => ({
  entries: [entry],
  assetUrls: { voice: 'blob:voice' },
  currentTime: 2,
  isPlaying: true,
  outputGain: 0.5,
});
function fixture() {
  const engine = new Engine();
  const read = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1, 2])));
  const createEngine = vi.fn(() => engine);
  const runtime = createProjectSourceVoiceoverAudioRuntime({ createEngine, fetch: read });
  return { engine, read, runtime, createEngine };
}
function gate<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it('schedules a mid-take seek with whole-entry tempo, fade phase and a separate scene bus', async () => {
  const { runtime, engine, read } = fixture();
  await runtime.sync(input());
  expect(read).toHaveBeenCalledWith('blob:voice', { signal: expect.any(AbortSignal) });
  expect(engine.prepareClip).toHaveBeenCalledWith({ duration: 20 }, entry, expect.any(AbortSignal));
  expect(engine.scheduleClip).toHaveBeenCalledWith(
    expect.objectContaining({ when: 100, offset: 1, duration: 3, playbackRate: 1 }),
    { duration: 4 }
  );
  const schedule = engine.scheduleClip.mock.calls[0]![0];
  expect(schedule.envelope[0]![1]).toBeCloseTo(0.8, 12);
  engine.clock += 0.05;
  await runtime.sync({ ...input(), currentTime: 2.05, outputGain: 0.3 });
  expect(engine.scheduleClip).toHaveBeenCalledTimes(1);
  expect(engine.setOutputGain).toHaveBeenLastCalledWith(0.3);
  expect(engine.setOriginalGain).not.toHaveBeenCalled();
  runtime.close();
  expect(engine.dispose).toHaveBeenCalledOnce();
});

it('keeps overlapping voices separate and avoids duplicate pending starts', async () => {
  const { runtime, engine } = fixture();
  const decoding = gate<ReviewAudioClipBuffer>();
  engine.decode.mockReturnValue(decoding.promise);
  const args = { ...input(), entries: [entry, { ...entry, clipId: 'second', timelineStart: 1.5 }] };
  const first = runtime.sync(args);
  await vi.waitFor(() => expect(engine.decode).toHaveBeenCalledOnce());
  const duplicate = runtime.sync(args);
  decoding.resolve({ duration: 20 });
  await Promise.all([first, duplicate]);
  expect(engine.decode).toHaveBeenCalledOnce();
  expect(engine.scheduleClip).toHaveBeenCalledTimes(2);
  await runtime.sync({ ...args, isPlaying: false });
  expect(engine.stopAll).toHaveBeenCalled();
});

it.each(['pause', 'close', 'seek', 'url'] as const)(
  'rejects delayed playback after %s without changing borrowed URLs',
  async (action) => {
    const { runtime, engine, read } = fixture();
    const old = gate<ReviewAudioClipBuffer>();
    engine.decode.mockReturnValueOnce(old.promise);
    const pending = runtime.sync(input());
    await vi.waitFor(() => expect(engine.decode).toHaveBeenCalledOnce());
    if (action === 'pause') await runtime.sync({ ...input(), isPlaying: false });
    if (action === 'close') runtime.close();
    if (action === 'seek') await runtime.sync({ ...input(), currentTime: 3 });
    if (action === 'url') await runtime.sync({ ...input(), assetUrls: { voice: 'blob:new' } });
    const expected = action === 'pause' || action === 'close' ? 0 : 1;
    expect(engine.scheduleClip).toHaveBeenCalledTimes(expected);
    old.resolve({ duration: 20 });
    await pending;
    expect(engine.scheduleClip).toHaveBeenCalledTimes(expected);
    if (action === 'url')
      expect(read).toHaveBeenLastCalledWith('blob:new', { signal: expect.any(AbortSignal) });
  }
);

it('ignores delayed old failure, reports current failure, and retries with a fresh graph', async () => {
  const { runtime, engine, read, createEngine } = fixture();
  const old = gate<ReviewAudioClipBuffer>();
  engine.decode.mockReturnValueOnce(old.promise);
  const pending = runtime.sync(input());
  await vi.waitFor(() => expect(engine.decode).toHaveBeenCalledOnce());
  await runtime.sync({ ...input(), assetUrls: { voice: 'blob:new' } });
  old.reject(new Error('Old decode'));
  await pending;
  read.mockRejectedValueOnce(new Error('Read failed'));
  await expect(runtime.sync({ ...input(), assetUrls: { voice: 'blob:failed' } })).rejects.toThrow(
    'Read failed'
  );
  runtime.reset();
  await runtime.sync({ ...input(), assetUrls: { voice: 'blob:failed' } });
  expect(createEngine).toHaveBeenCalledTimes(2);
  expect(engine.dispose).toHaveBeenCalledOnce();
});

it.each(['success', 'failure'] as const)(
  'keeps a new same-URL decode after the old decode settles with %s following reset',
  async (settlement) => {
    const { runtime, engine, read } = fixture();
    const old = gate<ReviewAudioClipBuffer>();
    const current = gate<ReviewAudioClipBuffer>();
    const oldStarted = gate<void>();
    const currentStarted = gate<void>();
    engine.decode
      .mockImplementationOnce(() => {
        oldStarted.resolve();
        return old.promise;
      })
      .mockImplementationOnce(() => {
        currentStarted.resolve();
        return current.promise;
      });
    const oldPreparation = runtime.prepare(input(), new AbortController().signal);
    await oldStarted.promise;
    runtime.reset();
    const currentPreparation = runtime.prepare(input(), new AbortController().signal);
    await currentStarted.promise;
    if (settlement === 'success') old.resolve({ duration: 10 });
    else old.reject(new Error('Old decode failed'));
    await oldPreparation;

    const duplicatePreparation = runtime.prepare(input(), new AbortController().signal);
    await engine.resume.mock.results[2]!.value;
    expect(read).toHaveBeenCalledTimes(2);
    expect(engine.decode).toHaveBeenCalledTimes(2);
    const currentBuffer = { duration: 30 };
    current.resolve(currentBuffer);
    await Promise.all([currentPreparation, duplicatePreparation]);
    expect(engine.prepareClip).toHaveBeenCalled();
    for (const [buffer] of engine.prepareClip.mock.calls) expect(buffer).toBe(currentBuffer);
    await runtime.sync(input());
    expect(read).toHaveBeenCalledTimes(2);
    expect(engine.scheduleClip).toHaveBeenCalledOnce();
    runtime.close();
  }
);

it('does not create a graph for paused, silent or ended plans', async () => {
  const { runtime, createEngine } = fixture();
  await runtime.sync({ ...input(), isPlaying: false });
  await runtime.sync({ ...input(), entries: [{ ...entry, volume: 0 }] });
  await runtime.sync({ ...input(), currentTime: 5 });
  expect(createEngine).not.toHaveBeenCalled();
});

it('propagates unavailable material and autoplay failure to the aggregate owner', async () => {
  const { runtime, engine } = fixture();
  await expect(runtime.sync({ ...input(), assetUrls: {} })).rejects.toThrow(
    'material is unavailable'
  );
  runtime.reset();
  engine.resume.mockRejectedValueOnce(new Error('Autoplay refused'));
  await expect(runtime.sync(input())).rejects.toThrow('Autoplay refused');
});

it('calls the browser fetch function without binding it to the runtime object', async () => {
  const engine = new Engine();
  const browserFetch = vi.fn(function (this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(new Response(new Uint8Array([1, 2])));
  });
  vi.stubGlobal('fetch', browserFetch);
  try {
    const runtime = createProjectSourceVoiceoverAudioRuntime({ createEngine: () => engine });
    await runtime.sync(input());
    expect(engine.scheduleClip).toHaveBeenCalledOnce();
    runtime.close();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('prepares the whole take before Play without scheduling while the transport is paused', async () => {
  const { runtime, engine } = fixture();
  const preparation = gate<ReviewAudioClipBuffer>();
  engine.prepareClip.mockReturnValueOnce(preparation.promise);
  const ready = runtime.prepare(input(), new AbortController().signal);
  await vi.waitFor(() => expect(engine.prepareClip).toHaveBeenCalledOnce());
  await runtime.sync({ ...input(), isPlaying: false });
  expect(engine.scheduleClip).not.toHaveBeenCalled();
  preparation.resolve({ duration: entry.duration });
  await ready;
  await runtime.sync(input());
  expect(engine.prepareClip).toHaveBeenCalledOnce();
  expect(engine.scheduleClip).toHaveBeenCalledOnce();
});

it('does not publish an aborted preparation and prepares it again before retry', async () => {
  const { runtime, engine } = fixture();
  const preparation = gate<ReviewAudioClipBuffer>();
  engine.prepareClip.mockReturnValueOnce(preparation.promise);
  const controller = new AbortController();
  const ready = runtime.prepare(input(), controller.signal);
  await vi.waitFor(() => expect(engine.prepareClip).toHaveBeenCalledOnce());
  controller.abort();
  preparation.resolve({ duration: entry.duration });
  await ready;
  expect(engine.scheduleClip).not.toHaveBeenCalled();
  await runtime.prepare(input(), new AbortController().signal);
  expect(engine.prepareClip).toHaveBeenCalledTimes(2);
  await runtime.sync(input());
  expect(engine.scheduleClip).toHaveBeenCalledOnce();
});
