import { describe, expect, it } from 'vitest';

import {
  decodeBase64Bytes,
  estimateBase64DecodedBytes,
  estimateUtf8Bytes,
  isBoundedBase64,
  isBoundedUtf8Text,
  isSafeDownloadFilename,
  isSafeDownloadMimeType,
} from './base64';

describe('base64 boundary validation', () => {
  it('decodes base64 into bytes', () => {
    expect(decodeBase64Bytes('AAH+/w==')).toEqual(new Uint8Array([0, 1, 254, 255]));
  });

  it('accepts only canonical bounded base64 before decode', () => {
    expect(isBoundedBase64('aGVsbG8=', 5)).toBe(true);
    expect(isBoundedBase64('aGVsbG8=', 4)).toBe(false);
    expect(isBoundedBase64('not valid base64', 100)).toBe(false);
    expect(isBoundedBase64('abc=', 2)).toBe(true);
    expect(isBoundedBase64('abc=', 1)).toBe(false);
    expect(estimateBase64DecodedBytes('aGVsbG8=')).toBe(5);
  });

  it('rejects unsafe download mime types and filenames', () => {
    expect(isSafeDownloadMimeType('application/zip')).toBe(true);
    expect(isSafeDownloadMimeType('video/webm')).toBe(true);
    expect(isSafeDownloadMimeType('image/svg+xml')).toBe(false);
    expect(isSafeDownloadMimeType('text/html')).toBe(false);
    expect(isSafeDownloadFilename('capture.png')).toBe(true);
    expect(isSafeDownloadFilename('../capture.png')).toBe(false);
    expect(isSafeDownloadFilename('bad/name.png')).toBe(false);
    expect(isSafeDownloadFilename('')).toBe(false);
  });

  it('bounds text payloads by UTF-8 byte size before blob allocation', () => {
    expect(estimateUtf8Bytes('WEBVTT')).toBe(6);
    expect(estimateUtf8Bytes('\u041f\u0440\u0438\u0432\u0435\u0442')).toBe(12);
    expect(estimateUtf8Bytes('\ud83c\udfac')).toBe(4);
    expect(isBoundedUtf8Text('WEBVTT', 6)).toBe(true);
    expect(isBoundedUtf8Text('WEBVTT', 5)).toBe(false);
    expect(isBoundedUtf8Text('', 5)).toBe(false);
  });
});
