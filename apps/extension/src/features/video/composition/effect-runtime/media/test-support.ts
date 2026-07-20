import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../runtime/resource-limits';

export function createWavBytes(channels = 2, sampleRate = 48_000): Uint8Array {
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const dataBytes = blockAlign;
  const bytes = new Uint8Array(44 + dataBytes);
  writeAscii(bytes, 0, 'RIFF');
  writeUint32Le(bytes, 4, bytes.byteLength - 8);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  writeUint32Le(bytes, 16, 16);
  writeUint16Le(bytes, 20, 1);
  writeUint16Le(bytes, 22, channels);
  writeUint32Le(bytes, 24, sampleRate);
  writeUint32Le(bytes, 28, sampleRate * blockAlign);
  writeUint16Le(bytes, 32, blockAlign);
  writeUint16Le(bytes, 34, bitsPerSample);
  writeAscii(bytes, 36, 'data');
  writeUint32Le(bytes, 40, dataBytes);
  return bytes;
}

export function createOversizedMpegBytes(): Uint8Array {
  const samplesPerFrame = 1_152;
  const frameLength = 104;
  const frames =
    Math.floor(EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedAudioBytes / (2 * samplesPerFrame * 4)) + 1;
  const bytes = new Uint8Array(frameLength * frames);
  for (let index = 0; index < frames; index += 1) {
    bytes.set([0xff, 0xfb, 0x10, 0], index * frameLength);
  }
  return bytes;
}

export function createOversizedOggOpusBytes(): Uint8Array {
  const packet = new Uint8Array(19);
  writeAscii(packet, 0, 'OpusHead');
  packet[8] = 1;
  packet[9] = 2;
  const bytes = new Uint8Array(28 + packet.byteLength);
  writeAscii(bytes, 0, 'OggS');
  bytes[4] = 0;
  bytes[5] = 2;
  const frames = EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedAudioBytes / (2 * 4) + 1;
  writeUint64Le(bytes, 6, frames);
  writeUint32Le(bytes, 14, 1);
  bytes[26] = 1;
  bytes[27] = packet.byteLength;
  bytes.set(packet, 28);
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  bytes.set(new TextEncoder().encode(value), offset);
}

function writeUint16Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function writeUint64Le(bytes: Uint8Array, offset: number, value: number): void {
  let remaining = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    bytes[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}
