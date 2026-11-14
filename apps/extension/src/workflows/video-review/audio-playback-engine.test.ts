// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createAudioEffectInstance } from '../../features/video/audio/effects/catalog';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';
import type { createAudioProcessingWorklet } from '../../features/video/audio/effects/worklet-node';
import type { ReviewAudioClipSource } from './audio-clip-source';
import { createReviewAudioEngine } from './audio-playback-engine';

const diagnostics = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@sniptale/platform/observability/logger', async (original) => {
  const actual = await original<typeof import('@sniptale/platform/observability/logger')>();
  return {
    ...actual,
    createLogger: (...args: Parameters<typeof actual.createLogger>) => {
      const logger = actual.createLogger(...args);
      return args[0].namespace === 'video-review.audio-processing'
        ? { ...logger, warn: diagnostics.warn }
        : logger;
    },
  };
});

class Node {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}
const contexts: Context[] = [];
class Context {
  sampleRate = 48000;
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = new Node();
  original = new Node();
  gains: Node[] = [];
  close = vi.fn(async () => undefined);
  resume = vi.fn(async () => undefined);
  constructor() {
    contexts.push(this);
  }
  createMediaElementSource() {
    return this.original;
  }
  createGain() {
    const node = new Node();
    this.gains.push(node);
    return node;
  }
}
afterEach(() => {
  contexts.length = 0;
  vi.unstubAllGlobals();
});

it('keeps the output bus independent of original gain and disposes both stages once', () => {
  vi.stubGlobal('AudioContext', Context);
  const engine = createReviewAudioEngine(document.createElement('video'));
  if (!engine) throw new Error('Missing engine');
  const context = contexts[0]!;
  const [original, output] = context.gains;
  expect(original?.connect).toHaveBeenCalledWith(context.destination);
  expect(output?.connect).toHaveBeenCalledWith(context.destination);
  expect(output?.gain.value).toBe(1);
  engine.setOriginalGain(2);
  engine.setOutputGain(0.25);
  expect(original?.gain.value).toBe(2);
  expect(output?.gain.value).toBe(0.25);
  engine.setOutputGain(0);
  expect(original?.gain.value).toBe(2);
  engine.dispose();
  engine.dispose();
  expect(original?.disconnect).toHaveBeenCalledOnce();
  expect(output?.disconnect).toHaveBeenCalledOnce();
  expect(context.original.disconnect).toHaveBeenCalledOnce();
  expect(context.close).toHaveBeenCalledOnce();
});

function processedFixture(original = false) {
  vi.stubGlobal('AudioContext', Context);
  const decoder: ReviewAudioClipSource = {
    sampleRate: 48000,
    numberOfChannels: 2,
    length: 480000,
    read: vi.fn(async (start, end) => ({
      start,
      planes: [new Float32Array(end - start), new Float32Array(end - start)],
    })),
    dispose: vi.fn(),
  };
  const output = new Node();
  const worklet = {
    output: output as unknown as AudioNode,
    prime: vi.fn(async () => {}),
    start: vi.fn(),
    dispose: vi.fn(),
  };
  const createWorklet = vi.fn<typeof createAudioProcessingWorklet>(async () => worklet);
  const openSource = vi.fn(async () => decoder);
  const engine = createReviewAudioEngine(original ? document.createElement('video') : null, {
    openSource,
    createWorklet,
  })!;
  const entry: QuickEditAudioPlanEntry = {
    lane: 'voiceover',
    clipId: 'voice',
    source: { kind: 'project', assetId: 'voice' },
    sourceOffset: 0.5,
    timelineStart: 0,
    duration: 2,
    playbackRate: 1.5,
    volume: 0.8,
    fadeIn: 0.1,
    fadeOut: 0.2,
    audioProcessing: {
      version: 1,
      bypassed: false,
      effects: [createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1')],
    },
  };
  return { engine, decoder, worklet, createWorklet, openSource, entry };
}
it('prepares bounded source PCM and schedules gain once on the owning graph', async () => {
  const { engine, decoder, worklet, createWorklet, entry } = processedFixture();
  const onError = vi.fn();
  const prepared = await engine.prepareProcessedClip!(
    new Blob(),
    entry,
    0.25,
    new AbortController().signal,
    onError
  );
  expect(worklet.prime).toHaveBeenCalledWith(12000);
  expect(worklet.start).not.toHaveBeenCalled();
  const options = createWorklet.mock.calls[0]![0];
  expect(options.durationFrames).toBe(96000);
  expect(options.rate).toBe(1.5);
  await options.source.read(0, 480);
  expect(decoder.read).toHaveBeenCalledWith(24000, 72000, expect.any(AbortSignal));
  const handle = prepared.schedule({
    when: 1,
    offset: 0.875,
    duration: 2.625,
    envelope: [
      [1, 0.8],
      [2.75, 0],
    ],
  });
  expect(worklet.start).toHaveBeenCalledWith(1, 96000, 12000);
  expect(contexts[0]!.gains[1]!.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 1);
  expect(contexts[0]!.gains[1]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 2.75);
  expect(() =>
    prepared.schedule({ when: 1, offset: 0.875, duration: 2.625, envelope: [] })
  ).toThrow('unavailable');
  options.onError(new Error('underrun'));
  expect(onError).toHaveBeenCalledOnce();
  handle.stop();
  engine.stopAll();
  engine.dispose();
  expect(worklet.dispose).toHaveBeenCalledOnce();
  expect(decoder.dispose).toHaveBeenCalledOnce();
});
it('releases a decoder that resolves after stop without creating a late Worklet', async () => {
  const { engine, decoder, openSource, createWorklet, entry } = processedFixture();
  let resolve!: (value: ReviewAudioClipSource) => void;
  openSource.mockReturnValue(
    new Promise((yes) => {
      resolve = yes;
    })
  );
  const preparing = engine.prepareProcessedClip!(
    new Blob(),
    entry,
    0,
    new AbortController().signal,
    vi.fn()
  );
  const rejected = expect(preparing).rejects.toThrow();
  await vi.waitFor(() => expect(openSource).toHaveBeenCalledOnce());
  engine.stopAll();
  resolve(decoder);
  await rejected;
  expect(decoder.dispose).toHaveBeenCalledOnce();
  expect(createWorklet).not.toHaveBeenCalled();
  engine.dispose();
});
it('releases an unscheduled primed placement on cancellation without closing the graph', async () => {
  const { engine, decoder, worklet, entry } = processedFixture();
  const controller = new AbortController();
  const prepared = await engine.prepareProcessedClip!(
    new Blob(),
    entry,
    0,
    controller.signal,
    vi.fn()
  );
  controller.abort();
  prepared.dispose();
  engine.stopAll();
  expect(worklet.start).not.toHaveBeenCalled();
  expect(worklet.dispose).toHaveBeenCalledOnce();
  expect(decoder.dispose).toHaveBeenCalledOnce();
  expect(contexts[0]!.close).not.toHaveBeenCalled();
  engine.dispose();
});

it('silences dry original audio while keeping the media clock connected until explicit bypass', async () => {
  const { engine, entry, worklet } = processedFixture(true);
  const context = contexts[0]!;
  const original = { ...entry, lane: 'original' as const };
  await expect(
    engine.prepareProcessedClip!(new Blob(), original, 0, new AbortController().signal, vi.fn())
  ).rejects.toThrow('route is unavailable');
  engine.setOriginalProcessing!(true);
  engine.setOriginalProcessing!(true);
  expect(context.original.disconnect).toHaveBeenCalledOnce();
  expect(context.original.connect).toHaveBeenLastCalledWith(context.gains[2]);
  expect(context.gains[2]!.gain.value).toBe(0);
  const prepared = await engine.prepareProcessedClip!(
    new Blob(),
    original,
    0,
    new AbortController().signal,
    vi.fn()
  );
  prepared.schedule({
    when: 1,
    offset: 0.5,
    duration: 3,
    envelopeMode: 'step',
    envelope: [
      [1, 0.8],
      [1.5, 0.2],
      [2, 0.8],
    ],
  });
  expect(context.gains[3]!.connect).toHaveBeenCalledWith(context.gains[4]);
  expect(context.gains[4]!.connect).toHaveBeenCalledWith(context.gains[0]);
  expect(context.gains[3]!.gain.setValueAtTime.mock.calls).toEqual([
    [0.8, 1],
    [0.2, 1.5],
    [0.8, 2],
  ]);
  expect(context.gains[3]!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  engine.setOriginalGain(0.2);
  expect(context.gains[0]!.gain.value).toBe(1);
  engine.stopAll();
  expect(context.original.connect).toHaveBeenCalledTimes(2);
  expect(context.gains[2]!.gain.value).toBe(0);
  expect(worklet.dispose).toHaveBeenCalledOnce();
  engine.setOriginalProcessing!(false);
  expect(context.gains[2]!.gain.value).toBe(1);
  expect(context.original.connect).toHaveBeenCalledTimes(2);
  engine.setOriginalGain(2);
  expect(context.gains[0]!.gain.value).toBe(2);
  engine.dispose();
});

it('reports only fixed audio preparation codes without source names or raw exceptions', async () => {
  diagnostics.warn.mockClear();
  const { engine, openSource, entry } = processedFixture();
  openSource.mockRejectedValueOnce(new Error('private-voice.webm?token=secret'));
  await expect(
    engine.prepareProcessedClip!(new Blob(), entry, 0, new AbortController().signal, vi.fn())
  ).rejects.toThrow('private-voice');
  expect(diagnostics.warn).toHaveBeenCalledExactlyOnceWith('Processed audio preview failed.', {
    stage: 'decode',
    reason: 'unknown',
  });
  expect(JSON.stringify(diagnostics.warn.mock.calls)).not.toMatch(/private-voice|secret|token/);
  engine.dispose();
});

it('smooths the transport attack without changing authored gain or source scheduling', async () => {
  const f = processedFixture();
  const prepared = await f.engine.prepareProcessedClip!(
    new Blob(),
    f.entry,
    0,
    new AbortController().signal,
    vi.fn()
  );
  prepared.schedule({
    when: 1,
    offset: 0.5,
    duration: 3,
    envelope: [
      [1, 0.8],
      [3, 0.4],
    ],
  });
  const edge = contexts[0]!.gains.at(-1)!;
  expect(edge.gain.setValueAtTime).toHaveBeenCalledWith(0, 1);
  expect(edge.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 1.005);
  expect(f.worklet.start).toHaveBeenCalledWith(1, 96000, 0);
  f.engine.dispose();
});
it('invalidates a cancelled audible job immediately but releases its graph after the preview edge', async () => {
  vi.useFakeTimers();
  const f = processedFixture(),
    parent = new AbortController(),
    onError = vi.fn();
  try {
    const prepared = await f.engine.prepareProcessedClip!(
      new Blob(),
      f.entry,
      0,
      parent.signal,
      onError
    );
    const handle = prepared.schedule({
      when: 1,
      offset: 0.5,
      duration: 3,
      envelope: [
        [1, 0.8],
        [3, 0.8],
      ],
    });
    contexts[0]!.currentTime = 1.2;
    parent.abort();
    expect(() => prepared.schedule({ when: 1.2, offset: 0.8, duration: 1, envelope: [] })).toThrow(
      'unavailable'
    );
    expect(f.worklet.dispose).not.toHaveBeenCalled();
    expect(f.decoder.dispose).not.toHaveBeenCalled();
    const edge = contexts[0]!.gains.at(-1)!;
    expect(edge.gain.cancelScheduledValues).toHaveBeenCalledWith(1.2);
    expect(edge.gain.setValueAtTime).toHaveBeenCalledWith(1, 1.2);
    expect(edge.gain.linearRampToValueAtTime.mock.lastCall?.[0]).toBe(0);
    // One picosecond is far below a PCM sample and admits only floating-point addition error.
    expect(edge.gain.linearRampToValueAtTime.mock.lastCall?.[1]).toBeCloseTo(1.205, 12);
    f.createWorklet.mock.calls[0]![0].onError(new Error('late cancelled error'));
    expect(onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4);
    expect(f.worklet.dispose).not.toHaveBeenCalled();
    contexts[0]!.currentTime = 1.211;
    await vi.advanceTimersByTimeAsync(7);
    expect(f.worklet.dispose).toHaveBeenCalledOnce();
    expect(f.decoder.dispose).toHaveBeenCalledOnce();
    handle.stop();
    f.engine.dispose();
    expect(f.worklet.dispose).toHaveBeenCalledOnce();
  } finally {
    f.engine.dispose();
    vi.useRealTimers();
  }
});

it('forces release of a fading graph on engine disposal and cancels its pending timer', async () => {
  vi.useFakeTimers();
  const f = processedFixture();
  try {
    const prepared = await f.engine.prepareProcessedClip!(
      new Blob(),
      f.entry,
      0,
      new AbortController().signal,
      vi.fn()
    );
    const handle = prepared.schedule({
      when: 1,
      offset: 0.5,
      duration: 3,
      envelope: [
        [1, 0.8],
        [3, 0.8],
      ],
    });
    contexts[0]!.currentTime = 1.2;
    handle.stop();
    expect(f.worklet.dispose).not.toHaveBeenCalled();
    f.engine.dispose();
    expect(f.worklet.dispose).toHaveBeenCalledOnce();
    expect(f.decoder.dispose).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.worklet.dispose).toHaveBeenCalledOnce();
  } finally {
    f.engine.dispose();
    vi.useRealTimers();
  }
});
