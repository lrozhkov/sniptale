import type { CapturePart, CaptureScreenshotResult, FullPageCaptureOptions } from './types';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getTotalCaptureParts(scrollHeight: number, viewportHeight: number): number {
  return Math.ceil(scrollHeight / viewportHeight);
}

export function createCapturePart(props: {
  captureHeight: number;
  data: string;
  offsetY: number;
}): CapturePart {
  return {
    captureHeight: props.captureHeight,
    dataUrl: `data:image/png;base64,${props.data}`,
    offsetY: props.offsetY,
  };
}

export function parseCaptureScreenshotResult(result: unknown): CaptureScreenshotResult {
  if (!isObjectRecord(result) || typeof result['data'] !== 'string') {
    throw new Error('Page.captureScreenshot returned an invalid response.');
  }

  return {
    data: result['data'],
  };
}

export function getStitchDrawSpec(props: {
  captureHeight: number;
  devicePixelRatio: number;
  imageHeight: number;
  imageWidth: number;
  offsetY: number;
}) {
  const sourceHeightDevice = props.captureHeight * props.devicePixelRatio;
  const sourceYDevice = props.imageHeight - sourceHeightDevice;
  const imgWidthCss = props.imageWidth / props.devicePixelRatio;
  const stitchDetails = [
    `css=${imgWidthCss.toFixed(0)}x${(props.imageHeight / props.devicePixelRatio).toFixed(0)}`,
    `drawHeight=${props.captureHeight}`,
    `sourceY=${sourceYDevice}`,
  ].join(', ');

  return {
    destHeight: props.captureHeight,
    destWidth: imgWidthCss,
    destX: 0,
    destY: props.offsetY,
    logMessage:
      `[Capture] Stitching part at offsetY=${props.offsetY}: ` +
      `img=${props.imageWidth}x${props.imageHeight} (device), ${stitchDetails}`,
    sourceHeight: sourceHeightDevice,
    sourceWidth: props.imageWidth,
    sourceX: 0,
    sourceY: sourceYDevice,
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
    format,
    quality,
    type: `image/${format}`,
  };
}
