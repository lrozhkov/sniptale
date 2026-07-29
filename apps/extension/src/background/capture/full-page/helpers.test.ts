import { describe, expect, it } from 'vitest';

import { parseCaptureScreenshotResult, resolveCaptureBlobOptions } from './helpers';

describe('capture-full-page result helpers', () => {
  it('resolves final blob options from settings defaults', () => {
    expect(
      resolveCaptureBlobOptions({
        imageFormat: 'webp',
        imageQuality: 82,
        options: {},
      })
    ).toEqual({
      format: 'webp',
      quality: 0.82,
      type: 'image/webp',
    });
  });

  it('falls back to the requested image format when no explicit blob override is provided', () => {
    expect(
      resolveCaptureBlobOptions({
        imageFormat: 'png',
        imageQuality: 90,
        options: {},
      })
    ).toEqual({
      format: 'png',
      quality: 0.9,
      type: 'image/png',
    });
  });

  it('parses screenshot payloads and rejects invalid debugger responses', () => {
    expect(parseCaptureScreenshotResult({ data: 'abc123' })).toEqual({
      data: 'abc123',
    });
    expect(() => parseCaptureScreenshotResult({ data: 123 })).toThrow(
      'Page.captureScreenshot returned an invalid response.'
    );
  });
});
