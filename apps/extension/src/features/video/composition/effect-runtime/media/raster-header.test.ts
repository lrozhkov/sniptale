import { describe, expect, it } from 'vitest';

import { EffectRasterHeaderError, inspectEffectRasterHeader } from './raster-header';
import { createPngHeader } from './raster-header.test-support';

describe('effect raster header preflight', () => {
  it('reads PNG, JPEG and WebP dimensions before browser decode', () => {
    expect(inspectEffectRasterHeader(createPngHeader(320, 180), 'image/png')).toEqual({
      height: 180,
      mimeType: 'image/png',
      width: 320,
    });
    expect(inspectEffectRasterHeader(createJpegHeader(640, 360), 'image/jpeg')).toEqual({
      height: 360,
      mimeType: 'image/jpeg',
      width: 640,
    });
    expect(inspectEffectRasterHeader(createWebpExtendedHeader(1280, 720), 'image/webp')).toEqual({
      height: 720,
      mimeType: 'image/webp',
      width: 1280,
    });
  });

  it('rejects malformed and oversized dimensions before decode', () => {
    expect(() => inspectEffectRasterHeader(new Uint8Array(24), 'image/png')).toThrow(
      EffectRasterHeaderError
    );
    expect(() => inspectEffectRasterHeader(createPngHeader(3841, 2160), 'image/png')).toThrow(
      EffectRasterHeaderError
    );
    expect(() =>
      inspectEffectRasterHeader(Uint8Array.of(0xff, 0xd8, 0x00, 0xc0), 'image/jpeg')
    ).toThrow(EffectRasterHeaderError);
    expect(() =>
      inspectEffectRasterHeader(createWebpExtendedHeader(0, 0).subarray(0, 20), 'image/webp')
    ).toThrow(EffectRasterHeaderError);
  });
});

describe('effect raster header profiles', () => {
  it('reads lossless and lossy WebP profiles and skips standalone JPEG markers', () => {
    expect(inspectEffectRasterHeader(createWebpLosslessHeader(2, 3), 'image/webp')).toMatchObject({
      height: 3,
      width: 2,
    });
    expect(inspectEffectRasterHeader(createWebpLossyHeader(4, 5), 'image/webp')).toMatchObject({
      height: 5,
      width: 4,
    });
    expect(
      inspectEffectRasterHeader(createJpegHeaderWithRestart(6, 7), 'image/jpeg')
    ).toMatchObject({
      height: 7,
      width: 6,
    });
  });
});

function createJpegHeader(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
  ]);
}

function createWebpExtendedHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set(new TextEncoder().encode('WEBPVP8X'), 8);
  writeUint24(bytes, 24, width - 1);
  writeUint24(bytes, 27, height - 1);
  return bytes;
}

function createWebpLosslessHeader(width: number, height: number): Uint8Array {
  const bytes = createWebpBase('VP8L');
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes[20] = 0x2f;
  bytes[21] = encodedWidth & 0xff;
  bytes[22] = ((encodedWidth >> 8) & 0x3f) | ((encodedHeight & 0x03) << 6);
  bytes[23] = (encodedHeight >> 2) & 0xff;
  bytes[24] = (encodedHeight >> 10) & 0x0f;
  return bytes;
}

function createWebpLossyHeader(width: number, height: number): Uint8Array {
  const bytes = createWebpBase('VP8 ');
  bytes.set([0x9d, 0x01, 0x2a], 23);
  new DataView(bytes.buffer).setUint16(26, width, true);
  new DataView(bytes.buffer).setUint16(28, height, true);
  return bytes;
}

function createWebpBase(chunk: string): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set(new TextEncoder().encode(`WEBP${chunk}`), 8);
  return bytes;
}

function createJpegHeaderWithRestart(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xd0,
    0xff,
    0xc2,
    0x00,
    0x07,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
  ]);
}

function writeUint24(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
}
