import { expect, it } from 'vitest';

import { inspectOggAudioProfile } from './ogg';

it('reads segmented Opus and Vorbis identification packets', () => {
  const segmentedHead = new Uint8Array(255);
  segmentedHead.set(createOpusHead());
  const segmentedOpus = concat(
    createPage(segmentedHead, null, 7),
    createPage(new Uint8Array(), 960, 7)
  );
  expect(inspectOggAudioProfile(segmentedOpus)).toEqual({
    channels: 2,
    frames: 648,
    sampleRate: 48_000,
  });
  expect(inspectOggAudioProfile(createPage(createVorbisHead(), 48_000))).toEqual({
    channels: 2,
    frames: 48_000,
    sampleRate: 44_100,
  });
});

it('rejects malformed pages, granules, serial changes, and codec headers', () => {
  const badMagic = createPage(createOpusHead(), 960);
  badMagic[0] = 0;
  const badVersion = createPage(createOpusHead(), 960);
  badVersion[4] = 1;
  const missingSegmentTable = createHeader(1);
  const missingPayload = concat(createHeader(1), Uint8Array.of(5));
  const serialDrift = concat(
    createPage(createOpusHead(), null, 1),
    createPage(new Uint8Array(), 960, 2)
  );
  const unsafeGranule = createPage(createOpusHead(), 960);
  unsafeGranule.fill(0xff, 6, 13);
  unsafeGranule[13] = 0x7f;

  for (const bytes of [
    new Uint8Array(26),
    badMagic,
    badVersion,
    missingSegmentTable,
    missingPayload,
    serialDrift,
    createPage(createOpusHead(), null),
    unsafeGranule,
    createPage(new Uint8Array(255), 960),
    createPage(ascii('unknown'), 960),
    createPage(ascii('OpusHead'), 960),
    createPage(createOpusHead(1_000), 960),
    createPage(concat(Uint8Array.of(1), ascii('vorbis')), 960),
  ]) {
    expect(() => inspectOggAudioProfile(bytes)).toThrow('AUDIO_PROFILE_INVALID');
  }
});

function createOpusHead(preSkip = 312): Uint8Array {
  const bytes = new Uint8Array(19);
  bytes.set(ascii('OpusHead'));
  bytes[8] = 1;
  bytes[9] = 2;
  writeUint16Le(bytes, 10, preSkip);
  return bytes;
}

function createVorbisHead(): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes[0] = 1;
  bytes.set(ascii('vorbis'), 1);
  bytes[11] = 2;
  writeUint32Le(bytes, 12, 44_100);
  return bytes;
}

function createPage(packet: Uint8Array, granule: number | null, serial = 1): Uint8Array {
  const bytes = concat(createHeader(1), Uint8Array.of(packet.byteLength), packet);
  if (granule === null) {
    bytes.fill(0xff, 6, 14);
  } else {
    writeUint64Le(bytes, 6, granule);
  }
  writeUint32Le(bytes, 14, serial);
  return bytes;
}

function createHeader(pageSegments: number): Uint8Array {
  const bytes = new Uint8Array(27);
  bytes.set(ascii('OggS'));
  bytes[26] = pageSegments;
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
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
