import type { RuntimeCanvasContext } from '../model/types.js';

export interface RuntimeBitmapAsset {
  bitmap: ImageBitmap;
  height?: number;
  width?: number;
}

export interface DrawImageAssetArgs {
  alpha?: number;
  composite?: GlobalCompositeOperation;
  filter?: string;
  fit?: 'contain' | 'cover' | 'fill';
  height?: number;
  opacity?: number;
  rotate?: number;
  scale?: number;
  shadowBlur?: number;
  shadowColor?: string;
  width?: number;
  x?: number;
  y?: number;
}

export function drawImageAsset(
  context: RuntimeCanvasContext,
  asset: RuntimeBitmapAsset,
  args: DrawImageAssetArgs = {}
): void {
  const {
    alpha = 1,
    fit = 'contain',
    height = asset.height ?? asset.bitmap.height,
    opacity = alpha,
    rotate = 0,
    scale = 1,
    composite = 'source-over',
    filter = 'none',
    shadowBlur = 0,
    shadowColor = 'transparent',
    width = asset.width ?? asset.bitmap.width,
    x = 0,
    y = 0,
  } = args;
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const crop = resolveCoverCrop(asset.bitmap, drawWidth, drawHeight, fit);
  context.save();
  context.globalAlpha *= opacity;
  context.globalCompositeOperation = composite;
  context.filter = filter;
  context.shadowBlur = shadowBlur;
  context.shadowColor = shadowColor;
  context.translate(x + drawWidth * 0.5, y + drawHeight * 0.5);
  context.rotate(rotate);
  context.drawImage(
    asset.bitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -drawWidth * 0.5,
    -drawHeight * 0.5,
    drawWidth,
    drawHeight
  );
  context.restore();
}

function resolveCoverCrop(
  bitmap: ImageBitmap,
  drawWidth: number,
  drawHeight: number,
  fit: DrawImageAssetArgs['fit']
): { height: number; width: number; x: number; y: number } {
  let width = bitmap.width;
  let height = bitmap.height;
  let x = 0;
  let y = 0;
  if (fit === 'cover') {
    const sourceRatio = bitmap.width / bitmap.height;
    const targetRatio = drawWidth / drawHeight;
    if (sourceRatio > targetRatio) {
      width = bitmap.height * targetRatio;
      x = (bitmap.width - width) * 0.5;
    } else {
      height = bitmap.width / targetRatio;
      y = (bitmap.height - height) * 0.5;
    }
  }
  return { height, width, x, y };
}
