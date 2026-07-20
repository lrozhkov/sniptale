import { describe, expect, it } from 'vitest';

import { isImageDataUrl } from './data-url';

function bytesToImageDataUrl(mimeType: string, bytes: number[]): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function createPngDataUrl(width: number, height: number): string {
  return bytesToImageDataUrl('image/png', [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52,
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
  ]);
}

function createJpegDataUrl(width: number, height: number): string {
  return bytesToImageDataUrl('image/jpeg', [
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
}

function createWebpDataUrl(width: number, height: number): string {
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  return bytesToImageDataUrl('image/webp', [
    0x52,
    0x49,
    0x46,
    0x46,
    0x16,
    0x00,
    0x00,
    0x00,
    0x57,
    0x45,
    0x42,
    0x50,
    0x56,
    0x50,
    0x38,
    0x58,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    encodedWidth & 0xff,
    (encodedWidth >>> 8) & 0xff,
    (encodedWidth >>> 16) & 0xff,
    encodedHeight & 0xff,
    (encodedHeight >>> 8) & 0xff,
    (encodedHeight >>> 16) & 0xff,
  ]);
}

describe('isImageDataUrl', () => {
  it('accepts supported raster image data urls with base64 payloads', () => {
    expect(isImageDataUrl('data:image/png;base64,QUJDRA==')).toBe(true);
    expect(isImageDataUrl('data:image/jpeg;base64,QUJDRA==')).toBe(true);
    expect(isImageDataUrl('data:image/webp;base64,QUJDRA==')).toBe(true);
    expect(isImageDataUrl(createPngDataUrl(1280, 720))).toBe(true);
    expect(isImageDataUrl(createJpegDataUrl(1280, 720))).toBe(true);
    expect(isImageDataUrl(createWebpDataUrl(1280, 720))).toBe(true);
  });

  it('rejects malformed or non-image data urls', () => {
    expect(isImageDataUrl('https://example.com/image.png')).toBe(false);
    expect(isImageDataUrl('data:text/plain;base64,QUJDRA==')).toBe(false);
    expect(isImageDataUrl('data:image/svg+xml,%3Csvg%3E')).toBe(false);
    expect(isImageDataUrl('data:image/svg+xml;base64,QUJDRA==')).toBe(false);
    expect(isImageDataUrl('data:image/png,%3Csvg%3E')).toBe(false);
    expect(isImageDataUrl('data:image/png;base64,not valid!')).toBe(false);
    expect(isImageDataUrl('data:image/png;base64,')).toBe(false);
  });

  it('rejects supported raster image data urls with oversized decoded dimensions', () => {
    expect(isImageDataUrl(createPngDataUrl(32_769, 100))).toBe(false);
    expect(isImageDataUrl(createPngDataUrl(20_000, 20_000))).toBe(false);
    expect(isImageDataUrl(createJpegDataUrl(32_769, 100))).toBe(false);
    expect(isImageDataUrl(createWebpDataUrl(32_769, 100))).toBe(false);
  });

  it('rejects image data urls with oversized encoded payloads', () => {
    const oversizedPayload = 'A'.repeat(Math.ceil((25 * 1024 * 1024 * 4) / 3) + 256);

    expect(isImageDataUrl(`data:image/png;base64,${oversizedPayload}`)).toBe(false);
  });
});
