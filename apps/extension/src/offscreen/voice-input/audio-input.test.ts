import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeVoiceAudio } from './audio-input';

function audioContext(samples = new Float32Array([-1, 0, 1])) {
  const decode = vi.fn(async () => ({ duration: samples.length / 16_000 }));
  const contexts: { channels: number; frames: number; rate: number }[] = [];
  class Context {
    destination = {};
    constructor(channels: number, frames: number, rate: number) {
      contexts.push({ channels, frames, rate });
    }
    decodeAudioData = decode;
    createBufferSource() {
      return { buffer: null, connect: vi.fn(), start: vi.fn() };
    }
    async startRendering() {
      return { getChannelData: () => samples };
    }
  }
  vi.stubGlobal('OfflineAudioContext', Context);
  return { decode, contexts };
}
afterEach(() => vi.unstubAllGlobals());

describe('voice audio normalization', () => {
  it('writes true mono PCM16 WAV with decoded-sample duration', async () => {
    const { contexts } = audioContext();
    const result = await normalizeVoiceAudio(
      { audio: new Blob(['webm']), durationSeconds: 99 },
      new AbortController().signal
    );
    const bytes = await result.audio.arrayBuffer();
    const view = new DataView(bytes);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
    expect(result.audio.type).toBe('audio/wav');
    expect(result.durationSeconds).toBe(3 / 16_000);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767);
    expect(contexts[1]).toEqual({ channels: 1, frames: 3, rate: 16_000 });
  });
  it('does not allocate a rendering buffer beyond the established input bounds', async () => {
    const { decode, contexts } = audioContext();
    decode.mockResolvedValue({ duration: 10_000 });
    await expect(
      normalizeVoiceAudio(
        { audio: new Blob(['webm']), durationSeconds: 1 },
        new AbortController().signal
      )
    ).rejects.toThrow('too-large');
    expect(contexts).toHaveLength(1);
  });
  it('rejects cancellation after decode before rendering or publication', async () => {
    const { decode, contexts } = audioContext();
    const controller = new AbortController();
    decode.mockImplementation(async () => {
      controller.abort();
      return { duration: 1 };
    });
    await expect(
      normalizeVoiceAudio({ audio: new Blob(['webm']), durationSeconds: 1 }, controller.signal)
    ).rejects.toThrow();
    expect(contexts).toHaveLength(1);
  });
});
