import { loadSettings } from '../../../composition/persistence/settings';
import { blobToDataURL, loadImage } from '../download/index';
import { getStitchDrawSpec, resolveCaptureBlobOptions } from './helpers';
import { getPageDimensions } from '../page-state/index';
import type { CapturePart, FullPageCaptureOptions } from './types';

export async function stitchCaptureParts(
  parts: CapturePart[],
  devicePixelRatio: number,
  tabId: number,
  options: FullPageCaptureOptions
) {
  const { scrollWidth, scrollHeight } = await getPageDimensions(tabId);
  const canvas = new OffscreenCanvas(scrollWidth, scrollHeight);
  const ctx = canvas.getContext('2d')!;

  for (const part of parts) {
    const img = await loadImage(part.dataUrl);
    const drawSpec = getStitchDrawSpec({
      captureHeight: part.captureHeight,
      devicePixelRatio,
      imageHeight: img.height,
      imageWidth: img.width,
      offsetY: part.offsetY,
    });

    ctx.drawImage(
      img,
      drawSpec.sourceX,
      drawSpec.sourceY,
      drawSpec.sourceWidth,
      drawSpec.sourceHeight,
      drawSpec.destX,
      drawSpec.destY,
      drawSpec.destWidth,
      drawSpec.destHeight
    );
  }

  return createFullPageCaptureDataUrl(canvas, options);
}

async function createFullPageCaptureDataUrl(
  canvas: OffscreenCanvas,
  options: FullPageCaptureOptions
) {
  const { imageFormat, imageQuality } = await loadSettings();
  const resolvedOptions = resolveCaptureBlobOptions({
    imageFormat,
    imageQuality,
    options,
  });
  const blob = await canvas.convertToBlob({
    type: resolvedOptions.type,
    quality: resolvedOptions.quality,
  });
  return blobToDataURL(blob);
}
