import type { CaptureScreenshotResult, FullPageCaptureOptions } from './types';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseCaptureScreenshotResult(result: unknown): CaptureScreenshotResult {
  if (!isObjectRecord(result) || typeof result['data'] !== 'string') {
    throw new Error('Page.captureScreenshot returned an invalid response.');
  }

  return {
    data: result['data'],
  };
}

export function resolveCaptureBlobOptions(props: {
  imageFormat: 'png' | 'jpeg' | 'webp';
  imageQuality: number;
  options: FullPageCaptureOptions;
}) {
  const format = props.options.format ?? props.imageFormat;
  const quality = props.options.quality ?? props.imageQuality / 100;

  return {
    format: format as 'png' | 'jpeg' | 'webp',
    quality,
    type: `image/${format}`,
  };
}
