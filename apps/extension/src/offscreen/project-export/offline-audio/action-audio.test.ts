import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { mixProjectActionAudio } from './action-audio';
import { createVideoProjectFromRecording } from '../../../features/video/project/factories/creation';

afterEach(() => vi.unstubAllGlobals());
it('mixes a surviving release at Speed with native duration and bounded preparation', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'rec',
    filename: 'rec.webm',
    width: 1280,
    height: 720,
    duration: 6,
    mimeType: 'video/webm',
    size: 1024,
    sourceNormalizedActionEvents: [
      {
        id: 'hold',
        kind: 'CLICK',
        time: 1,
        duration: 0.6,
        point: { x: 0.2, y: 0.3 },
        label: '',
        data: {
          gestureId: 'hold',
          gestureType: 'hold',
          downTime: 1,
          upTime: 4,
          completion: 'released',
          button: 0,
        },
        preset: 'NONE',
      },
    ],
  });
  project.actionFeedback![0]!.settings = [
    {
      ref: { kind: 'action', id: 'hold' },
      enabled: true,
      presetId: 'mouse-classic-paired-v2',
      volume: 0.5,
      offset: 0,
      upGain: 0.25,
    },
  ];
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  project.clips = [
    { ...clip, sourceStart: 2, sourceDuration: 4, startTime: 0, duration: 2, playbackRate: 2 },
  ];
  project.duration = 2;
  class PCM {
    sampleRate: number;
    length: number;
    numberOfChannels: number;
    planes: Float32Array[];
    constructor(options: { sampleRate: number; length: number; numberOfChannels: number }) {
      this.sampleRate = options.sampleRate;
      this.length = options.length;
      this.numberOfChannels = options.numberOfChannels;
      this.planes = Array.from(
        { length: options.numberOfChannels },
        () => new Float32Array(options.length)
      );
    }
    getChannelData(channel: number) {
      return this.planes[channel]!;
    }
  }
  class Decoder {
    state = 'running';
    close = vi.fn(async () => {
      this.state = 'closed';
    });
    async decodeAudioData(bytes: ArrayBuffer) {
      const result = new PCM({
        sampleRate: 44100,
        length: (bytes.byteLength - 44) / 2,
        numberOfChannels: 1,
      });
      const view = new DataView(bytes);
      for (let index = 0; index < result.length; index++)
        result.planes[0]![index] = view.getInt16(44 + index * 2, true) / 32768;
      return result;
    }
    createBufferSource() {
      throw new Error('The bounded mixer must not retain per-attack graph nodes');
    }
  }
  const decoders: Decoder[] = [];
  vi.stubGlobal(
    'AudioContext',
    class extends Decoder {
      constructor() {
        super();
        decoders.push(this);
      }
    }
  );
  vi.stubGlobal('AudioBuffer', PCM);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => path } });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (path: string) =>
        new Response(await readFile(new URL(`../../../../public/${path}`, import.meta.url)))
    )
  );
  const output = new AudioBuffer({ numberOfChannels: 2, length: 48000, sampleRate: 48000 });
  await mixProjectActionAudio(output, project, undefined, { start: 0.8, end: 1.8 });
  const plane = output.getChannelData(0);
  const nonzero = Array.from(plane.entries())
    .filter(([, value]) => value !== 0)
    .map(([index]) => index);
  expect(nonzero[0]).toBeGreaterThanOrEqual(9600);
  expect(nonzero[0]).toBeLessThanOrEqual(9602);
  // Allow sub-millisecond silence and resampling at the native sample boundary.
  expect((nonzero.at(-1)! - nonzero[0]!) / 48000).toBeCloseTo(7995 / 44100, 3);
  expect(nonzero.at(-1)).toBeLessThan(Math.ceil((0.2 + 7995 / 44100) * 48000));
  expect(Math.max(...plane.map(Math.abs))).toBeGreaterThan(0);
  expect(Math.max(...plane.map(Math.abs))).toBeLessThanOrEqual(0.0625);
  expect(output.getChannelData(1)).toEqual(plane);
  expect(decoders[0]!.close).toHaveBeenCalledOnce();
  const before = plane.slice();
  delete project.actionEvents[0]!.data['upTime'];
  project.actionEvents[0]!.data['completion'] = 'semantic';
  await mixProjectActionAudio(output, project);
  expect(plane).toEqual(before);
});
it('pre-aborted physical audio never acquires a decoder or writes output', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'aborted',
    filename: 'aborted.webm',
    width: 100,
    height: 100,
    duration: 3,
    mimeType: 'video/webm',
    size: 10,
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 0.6,
        point: { x: 0.2, y: 0.3 },
        label: '',
        data: {},
        preset: 'NONE',
      },
    ],
  });
  project.actionFeedback![0]!.settings = [
    {
      ref: { kind: 'action', id: 'click' },
      enabled: true,
      presetId: 'mouse-classic-v1',
      volume: 1,
      offset: 0,
    },
  ];
  const acquire = vi.fn();
  vi.stubGlobal('AudioContext', acquire);
  const abort = new AbortController();
  abort.abort();
  const output = {
    length: 48000,
    sampleRate: 48000,
    numberOfChannels: 1,
    getChannelData: vi.fn(() => new Float32Array(48000)),
  } as unknown as AudioBuffer;
  await expect(mixProjectActionAudio(output, project, abort.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(acquire).not.toHaveBeenCalled();
  expect(output.getChannelData).not.toHaveBeenCalled();
});

it('mixes recording cue windows with one global gain and preserves the existing fragment edge fade', async () => {
  const sourceOwner = await import('../../../workflows/video-review/recording-action-audio');
  const { buildReviewActionAudioPlan, reviewActionAudioAdmission } =
    await import('../../../features/video/review/action-audio');
  const { encodeRecordingEventCadence } =
    await import('../../../features/video/project/recording-events/records');
  const { buildReviewTimeMap } = await import('../../../features/video/review/timeline');
  const { applyVideoProjectMutationPatch } =
    await import('../../../features/video/project/mutation');
  const base = createVideoProjectFromRecording({
    recordingId: 'windowed',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 2,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    sourceNormalizedActionEvents: [],
    recordingSignals: [],
  });
  const settings = {
    ref: { kind: 'signal' as const, id: 'typing' },
    enabled: true,
    presetId: 'typing-recorded-v2' as const,
    volume: 0.5,
    offset: 0,
  };
  const project = applyVideoProjectMutationPatch(base, {
    actionFeedback: base.actionFeedback!.map((group) => ({
      ...group,
      settings: [settings],
      events: {
        format: 'recording-events-v1',
        formatVersion: 1,
        algorithm: 'lossless-v1',
        encoding: 'json-utf8-v1',
        eventStreamId: 'a'.repeat(32),
        state: 'complete',
        finalized: true,
        totalBlocks: 1,
        totalRecords: 4,
        totalBytes: 2000,
        streamSha256: 'b'.repeat(64),
      },
    })),
  });
  const plan = buildReviewActionAudioPlan({
    applied: true,
    settings: [settings],
    segments: buildReviewTimeMap(2, []),
    markers: [
      {
        ref: { kind: 'signal', id: 'typing' },
        eventType: 'typing',
        start: 0.9999,
        end: 1.0001,
        observed: true,
        recordingCadence: {
          onsets: [encodeRecordingEventCadence('cross-window', [999900, 1000100])],
          repeats: [],
        },
      },
    ],
  });
  const admit = vi.fn(async () => {
    const iterator = reviewActionAudioAdmission(plan);
    for (;;) {
      const next = iterator.next();
      if (next.done) return { ...next.value, firstCueTime: 0.9999 };
    }
  });
  const readWindow = vi.fn(async () => plan);
  const dispose = vi.fn();
  const create = vi
    .spyOn(sourceOwner, 'createRecordingProjectActionAudioSource')
    .mockReturnValue({ duration: 2, admit, readWindow, dispose });
  class PCM {
    sampleRate: number;
    length: number;
    numberOfChannels: number;
    planes: Float32Array[];
    constructor(options: { sampleRate: number; length: number; numberOfChannels: number }) {
      this.sampleRate = options.sampleRate;
      this.length = options.length;
      this.numberOfChannels = options.numberOfChannels;
      this.planes = Array.from(
        { length: options.numberOfChannels },
        () => new Float32Array(options.length)
      );
    }
    getChannelData(channel: number) {
      return this.planes[channel]!;
    }
  }
  class Decoder {
    state = 'running';
    async close() {
      this.state = 'closed';
    }
    async decodeAudioData(bytes: ArrayBuffer) {
      const result = new PCM({
        sampleRate: 44100,
        length: (bytes.byteLength - 44) / 2,
        numberOfChannels: 1,
      });
      const view = new DataView(bytes);
      for (let index = 0; index < result.length; index++)
        result.planes[0]![index] = view.getInt16(44 + index * 2, true) / 32768;
      return result;
    }
    createBufferSource() {
      throw new Error('Offline mixing cannot create per-attack nodes.');
    }
  }
  vi.stubGlobal('AudioBuffer', PCM);
  vi.stubGlobal('AudioContext', Decoder);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => path } });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (path: string) =>
        new Response(await readFile(new URL(`../../../../public/${path}`, import.meta.url)))
    )
  );
  try {
    const full = new AudioBuffer({ numberOfChannels: 1, sampleRate: 48000, length: 96000 });
    await mixProjectActionAudio(full, project);
    const fragment = new AudioBuffer({ numberOfChannels: 1, sampleRate: 48000, length: 9600 });
    await mixProjectActionAudio(fragment, project, undefined, { start: 0.9, end: 1.1 });
    expect(admit).toHaveBeenCalledTimes(2);
    expect(readWindow.mock.calls).toHaveLength(3);
    expect(dispose).toHaveBeenCalledTimes(2);
    const expected = full.getChannelData(0).subarray(43200, 52800);
    const actual = fragment.getChannelData(0);
    expect(Math.max(...actual.map(Math.abs))).toBeGreaterThan(0);
    let maxError = 0;
    for (let index = 0; index < actual.length; index++) {
      // The existing fragment contract fades a clipped sample over its final 10 milliseconds.
      const envelope = Math.min(1, (0.2 - index / 48000) / 0.01);
      maxError = Math.max(maxError, Math.abs(actual[index]! - expected[index]! * envelope));
    }
    expect(maxError).toBeLessThan(0.000001);
    expect(project.actionEvents).toEqual([]);
    expect(project.actionFeedback?.[0]?.signals).toEqual([]);
  } finally {
    create.mockRestore();
  }
});
