import type { FrameData } from '../../../../features/highlighter/contracts';
import { cloneCanvasBitmap, projectViewerFrames } from './canvas';
import { drawViewerDecorations } from './decoration';
import { drawViewerBlurLayers, drawViewerFocusLayer } from './effects';
import type { ViewerCaptureMode } from '../types';

function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Web snapshot viewer overlay image could not load.'));
    image.src = dataUrl;
  });
}

export async function composeViewerCaptureOverlays(args: {
  baseDataUrl: string;
  frames: FrameData[];
  iframe: HTMLIFrameElement;
  mode: ViewerCaptureMode;
}): Promise<string> {
  if (args.frames.length === 0) {
    return args.baseDataUrl;
  }

  const image = await loadDataUrlImage(args.baseDataUrl);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (imageWidth <= 0 || imageHeight <= 0) {
    return args.baseDataUrl;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Web snapshot viewer overlay canvas is unavailable.');
  }

  const scale = window.devicePixelRatio || 1;
  const width = imageWidth / scale;
  const height = imageHeight / scale;
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  context.drawImage(image, 0, 0, imageWidth, imageHeight);
  context.scale(scale, scale);
  const projections = projectViewerFrames(args);
  drawViewerFocusLayer({ context, projections, scale, width, height });
  const backdrop = cloneCanvasBitmap(canvas);
  if (!backdrop) {
    throw new Error('Web snapshot viewer effect backdrop is unavailable.');
  }
  drawViewerBlurLayers({ context, backdrop, projections, scale, width, height });
  drawViewerDecorations(context, projections);

  return canvas.toDataURL('image/png');
}
