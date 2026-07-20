import { translate } from '../i18n';

export async function createImageThumbnailBlob(
  blob: Blob,
  width = 320,
  height = 180
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);

  try {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error(translate('shared.runtime.thumbnailContextFailed'));
    }

    context.fillStyle = '#0f172a';
    context.fillRect(0, 0, width, height);

    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;

    context.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight);

    return canvas.convertToBlob({
      type: 'image/webp',
      quality: 0.88,
    });
  } finally {
    bitmap.close();
  }
}
