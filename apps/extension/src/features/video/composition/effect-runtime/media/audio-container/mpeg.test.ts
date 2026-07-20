import { expect, it } from 'vitest';

import { inspectMpegAudioProfile } from './mpeg';

it('reads MPEG versions, layers, channel modes, ID3 footers, and trailing metadata', () => {
  const variants = [
    {
      bytes: withId3FooterAndTag(createFrame({ layer: 1, length: 104, version: 3 })),
      expected: { channels: 2, frames: 1_152, sampleRate: 44_100 },
    },
    {
      bytes: createFrame({ layer: 3, length: 32, version: 3 }),
      expected: { channels: 2, frames: 384, sampleRate: 44_100 },
    },
    {
      bytes: createFrame({ layer: 1, length: 26, version: 2 }),
      expected: { channels: 2, frames: 576, sampleRate: 22_050 },
    },
    {
      bytes: createFrame({ bitrate: 2, channelMode: 3, layer: 2, length: 208, version: 0 }),
      expected: { channels: 1, frames: 1_152, sampleRate: 11_025 },
    },
  ];

  for (const { bytes, expected } of variants) {
    expect(inspectMpegAudioProfile(bytes)).toEqual(expected);
  }
  expect(
    inspectMpegAudioProfile(
      concat(createFrame({ layer: 1, length: 104, version: 3 }), new Uint8Array(8))
    )
  ).toEqual({ channels: 2, frames: 1_152, sampleRate: 44_100 });
});

it('rejects malformed metadata, headers, frame bounds, and sample-rate drift', () => {
  const shortId3 = ascii('ID3');
  const invalidSynchsafe = new Uint8Array(10);
  invalidSynchsafe.set(shortId3);
  invalidSynchsafe[6] = 0x80;
  const oversizedId3 = new Uint8Array(10);
  oversizedId3.set(shortId3);
  oversizedId3[9] = 0x7f;
  const invalidHeaders = [
    createFrame({ layer: 1, length: 4, version: 1 }),
    createFrame({ layer: 0, length: 4, version: 3 }),
    createFrame({ bitrate: 0, layer: 1, length: 4, version: 3 }),
    createFrame({ bitrate: 15, layer: 1, length: 4, version: 3 }),
    createFrame({ layer: 1, length: 4, sampleRate: 3, version: 3 }),
  ];
  const sampleRateDrift = concat(
    createFrame({ layer: 1, length: 104, version: 3 }),
    createFrame({ layer: 1, length: 96, sampleRate: 1, version: 3 })
  );

  for (const bytes of [
    new Uint8Array(),
    shortId3,
    invalidSynchsafe,
    oversizedId3,
    new Uint8Array(3),
    new Uint8Array(4),
    createFrame({ layer: 1, length: 4, version: 3 }),
    ...invalidHeaders,
    sampleRateDrift,
  ]) {
    expect(() => inspectMpegAudioProfile(bytes)).toThrow('AUDIO_PROFILE_INVALID');
  }
});

function createFrame(options: {
  bitrate?: number;
  channelMode?: number;
  layer: number;
  length: number;
  sampleRate?: number;
  version: number;
}): Uint8Array {
  const header =
    (0xffe00000 |
      (options.version << 19) |
      (options.layer << 17) |
      (1 << 16) |
      ((options.bitrate ?? 1) << 12) |
      ((options.sampleRate ?? 0) << 10) |
      ((options.channelMode ?? 0) << 6)) >>>
    0;
  const bytes = new Uint8Array(options.length);
  bytes[0] = header >>> 24;
  bytes[1] = header >>> 16;
  bytes[2] = header >>> 8;
  bytes[3] = header;
  return bytes;
}

function withId3FooterAndTag(frame: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(20 + frame.byteLength + 128);
  bytes.set(ascii('ID3'));
  bytes[5] = 0x10;
  bytes.set(frame, 20);
  bytes.set(ascii('TAG'), 20 + frame.byteLength);
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
