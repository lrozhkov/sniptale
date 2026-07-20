// policyStateIds: [] - WAV format identifiers are an immutable parser allowlist, not authority state.
import { readAscii, readUint16Le, readUint32Le } from './bytes';
import type { EffectAudioContainerProfile } from './types';

const MAX_WAV_CHUNKS = 4_096;
const SUPPORTED_WAV_FORMATS = new Set([1, 3, 0xfffe]);

export function inspectWavAudioProfile(bytes: Uint8Array): EffectAudioContainerProfile {
  if (bytes.byteLength < 12 || readAscii(bytes, 0, 4) !== 'RIFF') fail();
  if (readAscii(bytes, 8, 4) !== 'WAVE') fail();
  const declaredEnd = readUint32Le(bytes, 4) + 8;
  if (declaredEnd < 12 || declaredEnd > bytes.byteLength) fail();

  let format: { blockAlign: number; channels: number; sampleRate: number } | null = null;
  let dataBytes = 0;
  let offset = 12;
  let chunkCount = 0;
  while (offset + 8 <= declaredEnd) {
    chunkCount += 1;
    if (chunkCount > MAX_WAV_CHUNKS) fail();
    const id = readAscii(bytes, offset, 4);
    const size = readUint32Le(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (!Number.isSafeInteger(dataEnd) || dataEnd > declaredEnd) fail();
    if (id === 'fmt ') format = readWavFormat(bytes, dataStart, size);
    if (id === 'data') dataBytes = addSafe(dataBytes, size);
    offset = dataEnd + (size % 2);
  }
  if (!format || dataBytes <= 0 || dataBytes % format.blockAlign !== 0) fail();
  return {
    channels: format.channels,
    frames: dataBytes / format.blockAlign,
    sampleRate: format.sampleRate,
  };
}

function readWavFormat(
  bytes: Uint8Array,
  offset: number,
  size: number
): { blockAlign: number; channels: number; sampleRate: number } {
  if (size < 16) fail();
  const audioFormat = readUint16Le(bytes, offset);
  const channels = readUint16Le(bytes, offset + 2);
  const sampleRate = readUint32Le(bytes, offset + 4);
  const blockAlign = readUint16Le(bytes, offset + 12);
  const bitsPerSample = readUint16Le(bytes, offset + 14);
  if (
    !SUPPORTED_WAV_FORMATS.has(audioFormat) ||
    channels <= 0 ||
    sampleRate <= 0 ||
    blockAlign <= 0 ||
    bitsPerSample <= 0 ||
    blockAlign < Math.ceil((channels * bitsPerSample) / 8)
  ) {
    fail();
  }
  return { blockAlign, channels, sampleRate };
}

function addSafe(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) fail();
  return value;
}

function fail(): never {
  throw new Error('AUDIO_PROFILE_INVALID');
}
