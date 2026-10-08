import { createDefaultEngine } from './use-review-audio-runtime';
import { afterEach, expect, it, vi } from 'vitest';
import { openReviewAudioClipSource } from '../../workflows/video-review/audio-clip-source';
import { createReviewAudioClipRenderer } from '../../workflows/video-review/audio-clip-render';
class Pcm {
  readonly planes: Float32Array[];
  constructor(readonly options: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.planes = Array.from(
      { length: options.numberOfChannels },
      () => new Float32Array(options.length)
    );
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  get sampleRate() {
    return this.options.sampleRate;
  }
  get numberOfChannels() {
    return this.options.numberOfChannels;
  }
  get length() {
    return this.options.length;
  }
  getChannelData(channel: number) {
    return this.planes[channel]!;
  }
}
afterEach(() => vi.unstubAllGlobals());
it('decodes real44100Hz WAV windows and preserves native-grid tempo parity', async () => {
  vi.stubGlobal('AudioBuffer', Pcm);
  const rate = 44100;
  const frames = rate * 4;
  const data = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(data);
  const tag = (offset: number, text: string) =>
    [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, data.byteLength - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, frames * 2, true);
  const buffer = new AudioBuffer({ length: frames, sampleRate: rate, numberOfChannels: 1 });
  for (let i = 0; i < frames; i++) {
    const value = Math.round(Math.sin(i * 0.041 + Math.sin(i * 0.003)) * 12000);
    view.setInt16(44 + i * 2, value, true);
    buffer.getChannelData(0)[i] = value / 32768;
  }
  const signal = new AbortController().signal;
  const source = await openReviewAudioClipSource(new Blob([data], { type: 'audio/wav' }), signal);
  try {
    expect(source.sampleRate).toBe(rate);
    const clip = {
      lane: 'music' as const,
      clipId: 'm',
      assetId: 'wav',
      timelineStart: 0,
      sourceOffset: 0.2,
      duration: 2,
      playbackRate: 1.5,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    };
    const expected = await createReviewAudioClipRenderer().render(clip, buffer, 1.2, 1.8, signal);
    const actual = await createReviewAudioClipRenderer().render(clip, source, 1.2, 1.8, signal);
    expect(actual.getChannelData(0)).toEqual(expected.getChannelData(0));
    const captured: { buffer: AudioBuffer | null } = { buffer: null };
    vi.stubGlobal(
      'AudioContext',
      class {
        currentTime = 0;
        destination = {};
        async decodeAudioData() {
          return new AudioBuffer({ length: 48000 * 4, sampleRate: 48000, numberOfChannels: 1 });
        }
        async close() {}
        async resume() {}
        createBufferSource() {
          return {
            buffer: null as AudioBuffer | null,
            playbackRate: { value: 1 },
            connect() {},
            disconnect() {},
            stop() {},
            onended: null,
            start() {
              captured.buffer = this.buffer;
            },
          };
        }
        createGain() {
          return {
            gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
            connect() {},
            disconnect() {},
          };
        }
      }
    );
    const engine = createDefaultEngine(null)!;
    try {
      const live = await engine.prepareClip(await engine.decode(data.slice(0)), clip, signal);
      engine.scheduleClip(
        { when: 0, offset: 0, duration: clip.duration, envelope: [[0, 1]] },
        live
      );
      expect(captured.buffer!.sampleRate).toBe(44100);
      const offset = Math.round(1.2 * 44100) - Math.round(0.02 * 44100);
      expect(captured.buffer!.getChannelData(0).slice(offset, offset + actual.length)).toEqual(
        actual.getChannelData(0)
      );
    } finally {
      engine.dispose();
    }
  } finally {
    source.dispose();
  }
});
