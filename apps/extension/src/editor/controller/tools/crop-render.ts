import { translate } from '../../../platform/i18n';
import type { CropSelection } from '../core/types';

export async function cropRenderedEditorDocument(
  dataUrl: string,
  crop: CropSelection
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error(translate('editor.runtime.cropLoadFailed')));
    nextImage.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error(translate('editor.runtime.cropCanvasUnavailable'));
  }

  context.drawImage(
    image,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );
  return canvas.toDataURL('image/png');
}
