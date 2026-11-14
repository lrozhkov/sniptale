import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readAudioFixtureAsset } from 'sniptale:audio-test-assets';
import { createAudioEffectInstance } from '../../features/video/audio/effects/catalog';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';
import { Pcm } from './audio-clip-parity.test-support';
import { createReviewProcessedClip, hasReviewAudioProcessing } from './audio-clip-processing';
import { createReviewAudioClipRenderer } from './audio-clip-render';

beforeEach(() => vi.stubGlobal('AudioBuffer', Pcm));
afterEach(() => vi.unstubAllGlobals());
const readAsset = async (asset: { path: string }) => readAudioFixtureAsset(asset.path);
function fixture(): { entry: QuickEditAudioPlanEntry; buffer: AudioBuffer } {
  const effect = createAudioEffectInstance('saturation', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1');
  const buffer = new AudioBuffer({ length: 48000, sampleRate: 48000, numberOfChannels: 2 });
  for (let i = 0; i < buffer.length; i++) {
    buffer.getChannelData(0)[i] = 0.2 * Math.sin((2 * Math.PI * 180 * i) / 48000);
    buffer.getChannelData(1)[i] = -0.5 * buffer.getChannelData(0)[i]!;
  }
  return {
    buffer,
    entry: {
      lane: 'voiceover',
      clipId: 'take',
      source: { kind: 'project', assetId: 'owned' },
      timelineStart: 2,
      sourceOffset: 0.1,
      duration: 0.5,
      playbackRate: 1.25,
      volume: 0.4,
      fadeIn: 0.1,
      fadeOut: 0.1,
      audioProcessing: { version: 1, bypassed: false, effects: [effect] },
    },
  };
}
it('keeps inactive processing on the exact old bypass path', () => {
  const { entry } = fixture();
  expect(hasReviewAudioProcessing(undefined)).toBe(false);
  expect(hasReviewAudioProcessing({ version: 1, bypassed: false, effects: [] })).toBe(false);
  expect(hasReviewAudioProcessing({ ...entry.audioProcessing!, bypassed: true })).toBe(false);
  expect(hasReviewAudioProcessing(entry.audioProcessing)).toBe(true);
});
it(
  'matches the common processed stream across padded export ' +
    'windows and a seek at an independent clip tempo',
  async () => {
    const { entry, buffer } = fixture();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => new Response(readAudioFixtureAsset(url.pathname.slice(1))))
    );
    const signal = new AbortController().signal;
    const reference = await createReviewProcessedClip(entry, buffer, signal, readAsset);
    const renderer = createReviewAudioClipRenderer();
    try {
      const whole = (await reference.render(-960, 24960)).map((plane) => plane.slice());
      for (const [from, to] of [
        [0.13, 0.29],
        [0.29, 0.5],
        [0, 0.1],
      ]) {
        const output = await renderer.render(entry, buffer, from!, to!, signal);
        expect(output.sampleRate).toBe(48000);
        expect(output.length).toBe(Math.round(to! * 48000) - Math.round(from! * 48000) + 1920);
        const offset = Math.round(from! * 48000);
        for (let channel = 0; channel < 2; channel++)
          expect(output.getChannelData(channel)).toEqual(
            whole[channel]!.subarray(offset, offset + output.length)
          );
      }
    } finally {
      reference.dispose();
      renderer.dispose?.();
    }
    await expect(renderer.render(entry, buffer, 0, 0.1, signal)).rejects.toThrow('disposed');
  }
);
it('refuses unsupported layouts and corrupt assets without returning partial audio', async () => {
  const { entry } = fixture(),
    signal = new AbortController().signal;
  const unsupported = new AudioBuffer({ length: 48000, sampleRate: 48000, numberOfChannels: 3 });
  await expect(createReviewProcessedClip(entry, unsupported, signal, readAsset)).rejects.toThrow(
    'mono and stereo'
  );
  const { buffer } = fixture();
  await expect(
    createReviewProcessedClip(entry, buffer, signal, async () => new Uint8Array(4))
  ).rejects.toThrow('digest differs');
});
it('cancels a delayed decoder read and keeps the borrowed source unchanged', async () => {
  const { entry, buffer } = fixture();
  let resolve!: () => void;
  const pendingRead = new Promise<void>((done) => {
    resolve = done;
  });
  let entered!: () => void;
  const reading = new Promise<void>((done) => {
    entered = done;
  });
  const dispose = vi.fn(),
    controller = new AbortController();
  const input = {
    sampleRate: 48000,
    numberOfChannels: 2,
    length: buffer.length,
    dispose,
    async read(start: number, end: number) {
      entered();
      await pendingRead;
      return {
        start,
        planes: [0, 1].map((channel) => buffer.getChannelData(channel).slice(start, end)),
      };
    },
  };
  const renderer = await createReviewProcessedClip(entry, input, controller.signal, readAsset);
  const request = renderer.render(0, 128);
  const rejected = expect(request).rejects.toThrow();
  await reading;
  controller.abort();
  resolve();
  await rejected;
  expect(dispose).not.toHaveBeenCalled();
  renderer.dispose();
});
