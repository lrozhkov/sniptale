import type { FrameData } from '../../../features/highlighter/contracts';
import type { ViewerCaptureMode } from './types';

function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Web snapshot viewer overlay image could not load.'));
    image.src = dataUrl;
  });
}

function resolveFrameArea(args: {
  frame: FrameData;
  iframe: HTMLIFrameElement;
  mode: ViewerCaptureMode;
}): { height: number; width: number; x: number; y: number } {
  const iframeRect = args.iframe.getBoundingClientRect();
  const scrollX = args.mode === 'full' ? (args.iframe.contentWindow?.scrollX ?? 0) : 0;
  const scrollY = args.mode === 'full' ? (args.iframe.contentWindow?.scrollY ?? 0) : 0;

  return {
    height: args.frame.height,
    width: args.frame.width,
    x: args.frame.x - iframeRect.left + scrollX,
    y: args.frame.y - iframeRect.top + scrollY,
  };
}

function drawFrameOverlay(
  context: CanvasRenderingContext2D,
  frame: FrameData,
  area: { height: number; width: number; x: number; y: number }
): void {
  const border = frame.borderSettings;
  const borderWidth = border?.width ?? 2;
  const strokeOpacity = border?.strokeOpacity ?? border?.opacity ?? 1;
  const fillOpacity = border?.fillOpacity ?? 0;

  if (fillOpacity > 0) {
    context.save();
    context.globalAlpha = fillOpacity;
    context.fillStyle = border?.fillColor ?? border?.color ?? '#f97316';
    context.fillRect(area.x, area.y, area.width, area.height);
    context.restore();
  }

  context.save();
  context.globalAlpha = strokeOpacity;
  context.lineWidth = borderWidth;
  context.strokeStyle = border?.color ?? '#f97316';
  context.strokeRect(area.x, area.y, area.width, area.height);
  context.restore();
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
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  context.drawImage(image, 0, 0, imageWidth, imageHeight);
  context.scale(scale, scale);
  for (const frame of args.frames) {
    drawFrameOverlay(context, frame, resolveFrameArea({ ...args, frame }));
  }

  return canvas.toDataURL('image/png');
}
