import { expect, it } from 'vitest';
import { isSupportedPcmContentType, wrapPcmWav } from './pcm-wav';

it('wraps signed, silent and extreme samples in a precise mono 24 kHz WAV header', async () => {
  const pcm = new Uint8Array(48_000);
  const samples = new DataView(pcm.buffer);
  for (const [index, value] of [-32768, -1, 0, 1, 32767].entries())
    samples.setInt16(index * 2, value, true);
  const blob = wrapPcmWav(pcm);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const tag = (start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
  expect(blob.type).toBe('audio/wav');
  expect(blob.size).toBe(48_044);
  expect(tag(0, 4)).toBe('RIFF');
  expect(view.getUint32(4, true)).toBe(blob.size - 8);
  expect(tag(8, 16)).toBe('WAVEfmt ');
  expect(view.getUint32(16, true)).toBe(16);
  expect(view.getUint16(20, true)).toBe(1);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(24_000);
  expect(view.getUint32(28, true)).toBe(48_000);
  expect(view.getUint16(32, true)).toBe(2);
  expect(view.getUint16(34, true)).toBe(16);
  expect(tag(36, 40)).toBe('data');
  expect(view.getUint32(40, true)).toBe(pcm.length);
  expect(view.getUint32(40, true) / view.getUint32(28, true)).toBe(1);
  expect(bytes.subarray(44)).toEqual(pcm);
});

it.each([0, 1, 3])('rejects incomplete aggregate length %s', (length) => {
  expect(() => wrapPcmWav(new Uint8Array(length))).toThrow('invalid-response');
});

it.each([
  'audio/pcm',
  ' Audio/PCM ; RATE="24000"; CHANNELS=1 ',
  'audio/pcm; samplerate=24000; channels=1',
  'audio/pcm; sample-rate=24000; sample_rate=24000; charset=binary;',
])('accepts only the configured profile for %s', (mime) => {
  expect(isSupportedPcmContentType(mime)).toBe(true);
});

it.each([
  null,
  '',
  'audio/L16',
  'audio/wav',
  'application/octet-stream',
  'text/html',
  'audio/pcm; rate=48000',
  'audio/pcm; channels=2',
  'audio/pcm; samplerate=0',
  'audio/pcm; rate=24000; rate=44100',
  'audio/pcm; channels=mono',
  'audio/pcm; sample_rate=NaN',
  'audio/pcm; rate',
])('rejects unsupported or contradictory content type %s', (mime) => {
  expect(isSupportedPcmContentType(mime)).toBe(false);
});
