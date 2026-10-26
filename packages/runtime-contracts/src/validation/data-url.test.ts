import { describe, expect, it } from 'vitest';

import { isImageDataUrl, readImageDataUrlDimensions } from './data-url';

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

const realRasterSamples = [
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAA' +
    'D//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=',
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCI' +
    'FhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiW' +
    'FlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjA' +
    'AAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaI' +
    'AAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAA' +
    'ABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCA' +
    'gIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLE' +
    'BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAADAAIDASIAAhEBAxEB/8QAFQABA' +
    'QAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAB//EABQRAQAAAAAAAAAAA' +
    'AAAAAAAAAD/2gAMAwEAAhEDEQA/AJPAIo3f/9k=',
  'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAUAmJZgCdLoAA5gA/vcNb/cFJ6Gzy/7jsDdd4' +
    'gAA',
  'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAYAAAAdQpGKUrfBiOh/AAA=',
  'data:image/webp;base64,UklGRioCAABXRUJQVlA4WAoAAAAwAAAAAQAAAgAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCI' +
    'FhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiW' +
    'FlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjA' +
    'AAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaI' +
    'AAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAA' +
    'ABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIBwAAAAD/AAAAA' +
    'AAAVlA4ICwAAAAwAgCdASoCAAMAAUAmJZQCdGuAwQD1/wU8AAD9w1pr8zQjhNYUbnIjeQAA==',
];

describe('raster dimensions before decoding', () => {
  it.each(realRasterSamples)('reads complete encoded PNG, JPEG and WebP variants %#', (value) => {
    expect(readImageDataUrlDimensions(value)).toEqual({ width: 2, height: 3 });
  });
  it.each(realRasterSamples)(
    'refuses truncated headers without allocating a bitmap %#',
    (value) => {
      const prefix = value.slice(0, value.indexOf(',') + 1);
      expect(
        readImageDataUrlDimensions(
          prefix + Buffer.from(value.split(',')[1]!, 'base64').subarray(0, 20).toString('base64')
        )
      ).toBeNull();
    }
  );
  it('refuses oversized simple WebP dimensions while retaining the incumbent boolean behavior', () => {
    const bytes = Buffer.from(realRasterSamples[2]!.split(',')[1]!, 'base64');
    bytes[26] = 255;
    bytes[27] = 63;
    bytes[28] = 255;
    bytes[29] = 63;
    const value = `data:image/webp;base64,${bytes.toString('base64')}`;
    expect(isImageDataUrl(value)).toBe(true);
    expect(readImageDataUrlDimensions(value)).toBeNull();
    expect(readImageDataUrlDimensions(createPngDataUrl(32769, 1))).toBeNull();
  });
  it('refuses unrecognized and malformed raster headers', () => {
    expect(readImageDataUrlDimensions('data:image/png;base64,AA==')).toBeNull();
    expect(readImageDataUrlDimensions('https://example.com/image.png')).toBeNull();
  });
});

it('bounds explicit source byte budgets without changing the default boolean policy', () => {
  expect(readImageDataUrlDimensions(realRasterSamples[0], 128 * 1024 * 1024)).toEqual({
    width: 2,
    height: 3,
  });
  for (const limit of [0, -1, Infinity, 129 * 1024 * 1024, 1])
    expect(readImageDataUrlDimensions(realRasterSamples[0], limit)).toBeNull();
});
