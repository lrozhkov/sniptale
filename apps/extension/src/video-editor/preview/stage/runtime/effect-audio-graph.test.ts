import { afterEach, expect, it, vi } from 'vitest';
import { createPreviewEffectAudioGraph } from './effect-audio-graph';
import type { EffectRuntimeAudioPlan } from '../../../../features/video/composition/effect-runtime/audio/plan';

vi.mock('../../../../features/video/composition/effect-runtime/media/decode', () => ({
  decodeEffectAudio: async () =>
    new AudioBuffer({ length: 96000, sampleRate: 48000, numberOfChannels: 1 }),
}));
class Pcm {
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly planes: Float32Array[];
  constructor(options: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.numberOfChannels = options.numberOfChannels;
    this.planes = Array.from(
      { length: this.numberOfChannels },
      () => new Float32Array(this.length)
    );
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number) {
    return this.planes[c]!;
  }
}
afterEach(() => vi.unstubAllGlobals());
it('plays prepared effect audio at native pitch with source offsets converted to result time', async () => {
  const source = {
    buffer: null,
    playbackRate: { value: 1 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
    onended: null,
  };
  vi.stubGlobal('AudioBuffer', Pcm);
  vi.stubGlobal(
    'AudioContext',
    class {
      currentTime = 10;
      state = 'running';
      destination = {};
      createBufferSource() {
        return source;
      }
      createGain() {
        return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      }
      async close() {}
    }
  );
  const graph = createPreviewEffectAudioGraph();
  const buffer = await graph.decode(new Blob(), 'audio/wav', 2);
  expect(buffer.length).toBe(48000);
  const plan: EffectRuntimeAudioPlan = {
    id: 'effect',
    effectInstanceId: 'instance',
    snapshotId: 'snapshot',
    sourceKind: 'effect-snapshot',
    assetBlob: new Blob(),
    assetCacheKey: 'asset',
    assetMimeType: 'audio/wav',
    startTime: 2,
    sourceStart: 0.25,
    sourceDuration: 1,
    duration: 0.5,
    playbackRate: 2,
    volume: 1,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    audioGainStart: 1,
    audioGainEnd: 1,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
  };
  const node = graph.start({ buffer, plan, projectTime: 2.25, onEnded: vi.fn() });
  expect(source.playbackRate.value).toBe(1);
  expect(source.start).toHaveBeenCalledWith(0, 0.375, 0.25);
  expect(source.stop).toHaveBeenCalledWith(10.25);
  node!.stop();
  await graph.close();
  await expect(graph.decode(new Blob(), 'audio/wav', 2)).rejects.toThrow();
});
