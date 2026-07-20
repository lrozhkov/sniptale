import { describe, expect, it } from 'vitest';

import {
  createCapturePart,
  getStitchDrawSpec,
  getTotalCaptureParts,
  parseCaptureScreenshotResult,
  resolveCaptureBlobOptions,
} from './helpers';

describe('capture-full-page part helpers', () => {
  it('builds a capture part from a debugger screenshot payload', () => {
    expect(
      createCapturePart({
        captureHeight: 900,
        data: 'abc123',
        offsetY: 1200,
      })
    ).toEqual({
      captureHeight: 900,
      dataUrl: 'data:image/png;base64,abc123',
      offsetY: 1200,
    });
  });

  it('calculates stitch draw coordinates in css and device pixels', () => {
    expect(
      getStitchDrawSpec({
        captureHeight: 400,
        devicePixelRatio: 2,
        imageHeight: 1200,
        imageWidth: 1600,
        offsetY: 800,
      })
    ).toMatchObject({
      destHeight: 400,
      destWidth: 800,
      destY: 800,
      sourceHeight: 800,
      sourceY: 400,
    });
  });
});

describe('capture-full-page result helpers', () => {
  it('resolves total parts and final blob options from settings defaults', () => {
    expect(getTotalCaptureParts(2500, 800)).toBe(4);
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
