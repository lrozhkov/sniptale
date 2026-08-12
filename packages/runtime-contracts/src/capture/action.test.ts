import { expect, it } from 'vitest';
import {
  isDesktopScreenshotSelectionValue,
  isScreenshotCaptureConfigValue,
  normalizeScreenshotCaptureConfig,
} from './action';

const config = {
  screenshotMode: 'visible',
  viewportPresetId: null,
  delay: null,
  afterCapture: 'download_default',
  imageFormat: null,
  imageQuality: null,
  exitAfterCapture: false,
} as const;

it('accepts the exact screenshot capture contract and rejects malformed fields', () => {
  expect(isScreenshotCaptureConfigValue(config)).toBe(true);
  for (const invalid of [
    null,
    [],
    { ...config, screenshotMode: 'camera' },
    { ...config, viewportPresetId: 1 },
    { ...config, delay: 2 },
    { ...config, afterCapture: 'publish' },
    { ...config, imageFormat: 'gif' },
    { ...config, imageQuality: Number.NaN },
    { ...config, imageQuality: 0 },
    { ...config, imageQuality: 101 },
    { ...config, exitAfterCapture: 'yes' },
    { ...config, extra: true },
  ])
    expect(isScreenshotCaptureConfigValue(invalid)).toBe(false);
});

it('normalizes desktop and clipboard-only fields', () => {
  expect(
    normalizeScreenshotCaptureConfig({
      ...config,
      screenshotMode: 'desktop',
      viewportPresetId: 'wide',
      delay: 10,
      afterCapture: 'copy',
      imageFormat: 'webp',
      imageQuality: 80,
      exitAfterCapture: true,
    })
  ).toEqual({
    ...config,
    screenshotMode: 'desktop',
    afterCapture: 'copy',
    imageFormat: 'png',
  });
});

it('accepts only exact correlated desktop selections', () => {
  const selected = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
    height: 1,
    requestId: 'request-1',
    reservationToken: 'reservation-1',
    status: 'selected',
    width: 1,
  };
  expect(isDesktopScreenshotSelectionValue(selected)).toBe(true);
  expect(isDesktopScreenshotSelectionValue({ ...selected, extra: true })).toBe(false);
  expect(isDesktopScreenshotSelectionValue({ ...selected, dataUrl: 42 })).toBe(false);
});
