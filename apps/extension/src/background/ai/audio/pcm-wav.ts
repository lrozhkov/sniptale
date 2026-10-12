export const PCM_WAV_HEADER_BYTES = 44;
const PCM_SAMPLE_RATE = 24_000;
const PCM_BYTES_PER_SAMPLE = 2;

/** This wire profile is S16LE/24 kHz/mono; declared alternatives are not reinterpreted. */
export function isSupportedPcmContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const [essence, ...parameters] = contentType.split(';');
  if (essence?.trim().toLowerCase() !== 'audio/pcm') return false;
  for (const parameter of parameters) {
    if (!parameter.trim()) continue;
    const equals = parameter.indexOf('=');
    if (equals <= 0) return false;
    const name = parameter.slice(0, equals).trim().toLowerCase();
    const value = parameter
      .slice(equals + 1)
      .trim()
      .replace(/^"(.*)"$/u, '$1');
    const expected =
      name === 'channels'
        ? 1
        : ['rate', 'samplerate', 'sample-rate', 'sample_rate'].includes(name)
          ? PCM_SAMPLE_RATE
          : null;
    if (expected !== null && (!/^\d+$/u.test(value) || Number(value) !== expected)) return false;
  }
  return true;
}

/** Adds a RIFF header without transforming samples or allocating another complete audio buffer. */
export function wrapPcmWav(pcm: Uint8Array<ArrayBuffer>): Blob {
  if (
    pcm.byteLength === 0 ||
    pcm.byteLength % PCM_BYTES_PER_SAMPLE !== 0 ||
    pcm.byteLength > 0xffff_ffff - 36
  )
    throw new Error('invalid-response');
  const header = new Uint8Array(PCM_WAV_HEADER_BYTES);
  const view = new DataView(header.buffer);
  const text = new TextEncoder();
  header.set(text.encode('RIFF'), 0);
  view.setUint32(4, pcm.byteLength + 36, true);
  header.set(text.encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, PCM_SAMPLE_RATE, true);
  view.setUint32(28, PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE, true);
  view.setUint16(32, PCM_BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  header.set(text.encode('data'), 36);
  view.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm], { type: 'audio/wav' });
}
