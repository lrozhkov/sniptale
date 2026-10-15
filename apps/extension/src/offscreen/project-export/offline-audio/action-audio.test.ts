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
