import { createLogger } from '@sniptale/platform/observability/logger';
import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';

const logger = createLogger({ namespace: 'ContentImageCrop' });

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

export async function cropImage(dataUrl: string, area: CaptureArea): Promise<string> {
  logger.debug('Cropping image', { area });

  try {
    const img = await loadImage(dataUrl);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    const scale = window.devicePixelRatio || 1;

    canvas.width = area.width * scale;
    canvas.height = area.height * scale;

    ctx.drawImage(
      img,
      area.x * scale,
      area.y * scale,
      area.width * scale,
      area.height * scale,
      0,
      0,
      area.width * scale,
      area.height * scale
    );

    const croppedDataUrl = canvas.toDataURL('image/png');

    logger.info('Image cropped successfully');

    return croppedDataUrl;
  } catch (error) {
    logger.error('Failed to crop image', error);
    throw error;
  }
}
