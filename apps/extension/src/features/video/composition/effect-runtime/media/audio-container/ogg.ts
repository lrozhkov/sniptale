import { readAscii, readSafeUint64Le, readUint16Le, readUint32Le } from './bytes';
import type { EffectAudioContainerProfile } from './types';

const MAX_OGG_PAGES = 131_072;
const MAX_IDENTIFICATION_PACKET_BYTES = 65_536;

export function inspectOggAudioProfile(bytes: Uint8Array): EffectAudioContainerProfile {
  let offset = 0;
  let pageCount = 0;
  let serial: number | null = null;
  let lastGranule: number | null = null;
  const firstPacket: number[] = [];
  let firstPacketComplete = false;
  while (offset < bytes.byteLength) {
    pageCount += 1;
    if (pageCount > MAX_OGG_PAGES || offset + 27 > bytes.byteLength) fail();
    if (readAscii(bytes, offset, 4) !== 'OggS' || bytes[offset + 4] !== 0) fail();
    const pageSegments = bytes[offset + 26]!;
    const segmentTableEnd = offset + 27 + pageSegments;
    if (segmentTableEnd > bytes.byteLength) fail();
    const pageSerial = readUint32Le(bytes, offset + 14);
    if (serial !== null && serial !== pageSerial) fail();
    serial = pageSerial;
    const granule = readOggGranule(bytes, offset + 6);
    if (granule !== null) lastGranule = granule;
    let payloadOffset = segmentTableEnd;
    for (let index = 0; index < pageSegments; index += 1) {
      const length = bytes[offset + 27 + index]!;
      if (payloadOffset + length > bytes.byteLength) fail();
      if (!firstPacketComplete) {
        if (firstPacket.length + length > MAX_IDENTIFICATION_PACKET_BYTES) fail();
        firstPacket.push(...bytes.subarray(payloadOffset, payloadOffset + length));
        if (length < 255) firstPacketComplete = true;
      }
      payloadOffset += length;
    }
    offset = payloadOffset;
  }
  if (!firstPacketComplete || lastGranule === null) fail();
  return resolveOggCodecProfile(Uint8Array.from(firstPacket), lastGranule);
}

function readOggGranule(bytes: Uint8Array, offset: number): number | null {
  if (bytes.subarray(offset, offset + 8).every((value) => value === 0xff)) return null;
  const value = readSafeUint64Le(bytes, offset);
  if (value === null) fail();
  return value;
}

function resolveOggCodecProfile(
  identification: Uint8Array,
  lastGranule: number
): EffectAudioContainerProfile {
  if (readAscii(identification, 0, 8) === 'OpusHead') {
    if (identification.byteLength < 19) fail();
    const channels = identification[9]!;
    const preSkip = readUint16Le(identification, 10);
    if (lastGranule <= preSkip) fail();
    return { channels, frames: lastGranule - preSkip, sampleRate: 48_000 };
  }
  if (identification[0] === 1 && readAscii(identification, 1, 6) === 'vorbis') {
    if (identification.byteLength < 30) fail();
    return {
      channels: identification[11]!,
      frames: lastGranule,
      sampleRate: readUint32Le(identification, 12),
    };
  }
  fail();
}

function fail(): never {
  throw new Error('AUDIO_PROFILE_INVALID');
}
