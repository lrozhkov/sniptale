import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewAudioClipRenderer } from './audio-clip-render';
import { renderTempoBuffer } from '../../features/video/audio/tempo-buffer';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';
import { Pcm, createParitySource, expectAudioClipWindows } from './audio-clip-parity.test-support';

beforeEach(() => vi.stubGlobal('AudioBuffer', Pcm));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function entry(rate: number, duration = 1.3): QuickEditAudioPlanEntry {
  return {
    lane: 'voiceover',
    clipId: 'voice',
    source: { kind: 'project' as const, assetId: 'voice' },
    timelineStart: 0,
    sourceOffset: 0.37,
    duration,
    playbackRate: rate,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
}

it('matches full preview and streamed PCM across short native-rate windows, overlap and seek', async () => {
  const sampleRate = 44100;
  const source = new AudioBuffer({ length: sampleRate * 2, sampleRate, numberOfChannels: 2 });
  for (let frame = 0; frame < source.length; frame++) {
    const value =
      Math.sin(frame * 0.021 + Math.sin(frame * 0.0003)) * 0.4 + Math.sin(frame * 0.037) * 0.1;
    source.getChannelData(0)[frame] = value;
    source.getChannelData(1)[frame] = -value * 0.5;
  }
  const clip = entry(1.5, 0.6);
  const preview = await renderTempoBuffer(source, {
    start: clip.sourceOffset,
    duration: clip.duration * 1.5,
    rate: 1.5,
  });
  await expectAudioClipWindows({
    clip,
    source,
    preview,
    windows: [
      [0.13, 0.33],
      [0.33, 0.6],
      [0, 0.1],
    ],
  });
  expect(source.length).toBe(sampleRate * 2);
});

it.each([0.0625, 0.5, 2, 16])(
  'preserves vocal pitch and exact duration at %sx with bounded output',
  async (rate) => {
    const sampleRate = 48000;
    const duration = 3;
    const clip = entry(rate, duration);
    const source = new AudioBuffer({
      length: Math.ceil((clip.sourceOffset + duration * rate) * sampleRate),
      sampleRate,
      numberOfChannels: 1,
    });
    for (let i = 0; i < source.length; i++)
      source.getChannelData(0)[i] = Math.sin((2 * Math.PI * 180 * i) / sampleRate) * 0.5;
    const output = await createReviewAudioClipRenderer().render(
      clip,
      source,
      1,
      2,
      new AbortController().signal
    );
    expect(output.length).toBe(Math.round(1.04 * sampleRate));
    let crossings = 0;
    const plane = output.getChannelData(0);
    for (let i = 4801; i < plane.length - 4800; i++)
      if (plane[i - 1]! < 0 && plane[i]! >= 0) crossings++;
    expect((crossings * sampleRate) / (plane.length - 9600)).toBeCloseTo(180, -1);
  }
);

it('cancels while priming a late fragment and never returns a partial buffer', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const source = new AudioBuffer({ length: 48000 * 12, sampleRate: 48000, numberOfChannels: 1 });
  const pending = createReviewAudioClipRenderer().render(
    entry(2, 5),
    source,
    4,
    5,
    controller.signal
  );
  const rejection = expect(pending).rejects.toThrow('cancelled');
  controller.abort(new Error('cancelled'));
  await vi.runAllTimersAsync();
  await rejection;
});

it.each(
  [0.0625, 0.5, 1, 1.5, 2, 16].flatMap((rate) =>
    [0, 0.037, 0.37, 1.25].map((sourceOffset) => ({ rate, sourceOffset }))
  )
)(
  'matches preview and bounded windows at $rate x / offset $sourceOffset across chunks and seek',
  async ({ rate, sourceOffset }) => {
    const duration = 1.1;
    const source = createParitySource({ sampleRate: 8000, rate, sourceOffset, duration });
    const clip = { ...entry(rate, duration), sourceOffset };
    const preview = await renderTempoBuffer(source, {
      start: sourceOffset,
      duration: duration * rate,
      rate,
    });
    await expectAudioClipWindows({
      clip,
      source,
      preview,
      windows: [
        [0.31, 0.61],
        [0.61, 0.93],
        [0, 0.13],
        [0.93, 1.1],
      ],
    });
  }
);
