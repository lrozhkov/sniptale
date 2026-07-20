import { readAscii } from './bytes';
import type { EffectAudioContainerProfile } from './types';

const MAX_MPEG_FRAMES = 131_072;
const SAMPLE_RATES = [44_100, 48_000, 32_000] as const;
const MPEG1_BITRATES = {
  1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
} as const;
const MPEG2_BITRATES = {
  1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
} as const;

export function inspectMpegAudioProfile(bytes: Uint8Array): EffectAudioContainerProfile {
  let offset = readId3v2End(bytes);
  let channels = 0;
  let frameCount = 0;
  let frames = 0;
  let sampleRate: number | null = null;
  while (offset < bytes.byteLength) {
    if (isTrailingMetadataOrPadding(bytes, offset)) break;
    const frame = readMpegFrame(bytes, offset);
    frameCount += 1;
    if (frameCount > MAX_MPEG_FRAMES) fail();
    if (sampleRate !== null && sampleRate !== frame.sampleRate) fail();
    channels = Math.max(channels, frame.channels);
    frames = addSafe(frames, frame.samples);
    sampleRate = frame.sampleRate;
    offset += frame.length;
  }
  if (sampleRate === null || frameCount === 0) fail();
  return { channels, frames, sampleRate };
}

function readId3v2End(bytes: Uint8Array): number {
  if (readAscii(bytes, 0, 3) !== 'ID3') return 0;
  if (bytes.byteLength < 10) fail();
  const sizeBytes = bytes.subarray(6, 10);
  if ([...sizeBytes].some((value) => (value & 0x80) !== 0)) fail();
  const size = [...sizeBytes].reduce((total, value) => total * 128 + value, 0);
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0;
  const end = 10 + size + footer;
  if (!Number.isSafeInteger(end) || end > bytes.byteLength) fail();
  return end;
}

function readMpegFrame(
  bytes: Uint8Array,
  offset: number
): { channels: number; length: number; sampleRate: number; samples: number } {
  if (offset + 4 > bytes.byteLength) fail();
  const header =
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0;
  if ((header & 0xffe00000) >>> 0 !== 0xffe00000) fail();
  const versionBits = (header >>> 19) & 0x3;
  const layerBits = (header >>> 17) & 0x3;
  const bitrateIndex = (header >>> 12) & 0xf;
  const sampleRateIndex = (header >>> 10) & 0x3;
  const padding = (header >>> 9) & 0x1;
  if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15) fail();
  if (sampleRateIndex === 3) fail();
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer = (4 - layerBits) as 1 | 2 | 3;
  const bitrateTable = version === 1 ? MPEG1_BITRATES[layer] : MPEG2_BITRATES[layer];
  const bitrate = bitrateTable[bitrateIndex]! * 1_000;
  const sampleRate = SAMPLE_RATES[sampleRateIndex]! / (version === 1 ? 1 : version === 2 ? 2 : 4);
  const length = resolveMpegFrameLength(layer, version, bitrate, sampleRate, padding);
  if (length < 4 || offset + length > bytes.byteLength) fail();
  return {
    channels: ((header >>> 6) & 0x3) === 3 ? 1 : 2,
    length,
    sampleRate,
    samples: layer === 1 ? 384 : layer === 2 || version === 1 ? 1_152 : 576,
  };
}

function resolveMpegFrameLength(
  layer: 1 | 2 | 3,
  version: number,
  bitrate: number,
  sampleRate: number,
  padding: number
): number {
  if (layer === 1) return Math.floor((12 * bitrate) / sampleRate + padding) * 4;
  const coefficient = layer === 3 && version !== 1 ? 72 : 144;
  return Math.floor((coefficient * bitrate) / sampleRate + padding);
}

function isTrailingMetadataOrPadding(bytes: Uint8Array, offset: number): boolean {
  if (bytes.byteLength - offset === 128 && readAscii(bytes, offset, 3) === 'TAG') return true;
  for (let index = offset; index < bytes.byteLength; index += 1) {
    if (bytes[index] !== 0) return false;
  }
  return true;
}

function addSafe(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) fail();
  return value;
}

function fail(): never {
  throw new Error('AUDIO_PROFILE_INVALID');
}
