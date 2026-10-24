import {
  VOICE_HISTORY_MAX_AUDIO_BYTES,
  VOICE_HISTORY_MAX_DURATION_SECONDS,
} from '@sniptale/runtime-contracts/voice-input';

export type VoiceAudioInput = { audio: Blob; durationSeconds: number };

/** Uses decoded sample count as duration and produces real mono 16 kHz PCM16 WAV. */
export async function normalizeVoiceAudio(
  input: VoiceAudioInput,
  signal: AbortSignal
): Promise<VoiceAudioInput> {
  signal.throwIfAborted();
  if (input.audio.size > VOICE_HISTORY_MAX_AUDIO_BYTES) throw new Error('too-large');
  const decoder = new OfflineAudioContext(1, 1, 16_000);
  const decoded = await decoder.decodeAudioData(await input.audio.arrayBuffer());
  signal.throwIfAborted();
  const frames = Math.ceil(decoded.duration * 16_000);
  if (
    frames <= 0 ||
    frames / 16_000 > VOICE_HISTORY_MAX_DURATION_SECONDS ||
    44 + frames * 2 > VOICE_HISTORY_MAX_AUDIO_BYTES
  )
    throw new Error('too-large');
  const renderer = new OfflineAudioContext(1, frames, 16_000);
  const source = renderer.createBufferSource();
  source.buffer = decoded;
  source.connect(renderer.destination);
  source.start();
  const rendered = await renderer.startRendering();
  signal.throwIfAborted();
  const samples = rendered.getChannelData(0);
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1)
      view.setUint8(offset + index, text.charCodeAt(index));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return {
    audio: new Blob([bytes], { type: 'audio/wav' }),
    durationSeconds: samples.length / 16_000,
  };
}
