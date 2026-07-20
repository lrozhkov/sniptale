import type { VideoProjectShapeClip } from '../../project/types/index';
import { drawRoundedRectPath } from './shared';

export function drawShapeCompositionLayer(
  context: CanvasRenderingContext2D,
  clip: VideoProjectShapeClip,
  x: number,
  y: number,
  width: number,
  height: number,
  loadedImages: Record<string, HTMLImageElement> = {}
): void {
  if (clip.shapeType === 'LINE' || clip.shapeType === 'ARROW') {
    drawConnectorShapeCompositionLayer(context, clip, x, y, width, height);
    drawShapeEmbeddedAsset(context, clip, x, y, width, height, loadedImages);
    return;
  }

  context.beginPath();
  if (clip.shapeType === 'ELLIPSE') {
    context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else {
    drawRoundedRectPath(context, x, y, width, height, clip.style.borderRadius);
  }

  context.fillStyle = clip.style.fillColor;
  context.fill();
  context.lineWidth = clip.style.strokeWidth;
  context.strokeStyle = clip.style.strokeColor;
  context.stroke();
  drawShapeEmbeddedAsset(context, clip, x, y, width, height, loadedImages);
}

function drawShapeEmbeddedAsset(
  context: CanvasRenderingContext2D,
  clip: VideoProjectShapeClip,
  x: number,
  y: number,
  width: number,
  height: number,
  loadedImages: Record<string, HTMLImageElement>
): void {
  const embeddedAsset = clip.embeddedAsset;
  const image = embeddedAsset ? loadedImages[embeddedAsset.assetId] : null;
  if (!embeddedAsset || !image) {
    return;
  }

  const scaleX = width / Math.max(1, clip.transform.width);
  const scaleY = height / Math.max(1, clip.transform.height);
  const placement = embeddedAsset.placement;

  context.save();
  context.globalAlpha *= embeddedAsset.opacity ?? 1;
  context.drawImage(
    image,
    x + placement.x * scaleX,
    y + placement.y * scaleY,
    placement.width * scaleX,
    placement.height * scaleY
  );
  context.restore();
}

function drawConnectorShapeCompositionLayer(
  context: CanvasRenderingContext2D,
  clip: VideoProjectShapeClip,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const strokeWidth = Math.max(1, clip.style.strokeWidth);
  const centerY = y + height / 2;
  const arrowSize = Math.max(10, strokeWidth * 3);
  const lineEndX =
    clip.shapeType === 'ARROW' ? Math.max(x, x + width - arrowSize * 0.65) : x + width;

  context.beginPath();
  context.lineCap = 'round';
  context.lineWidth = strokeWidth;
  context.strokeStyle = clip.style.strokeColor;
  context.moveTo(x, centerY);
  context.lineTo(lineEndX, centerY);
  context.stroke();

  if (clip.shapeType !== 'ARROW') {
    return;
  }

  context.beginPath();
  context.fillStyle = clip.style.strokeColor;
  context.moveTo(x + width, centerY);
  context.lineTo(x + width - arrowSize, centerY - arrowSize / 2);
  context.lineTo(x + width - arrowSize, centerY + arrowSize / 2);
  context.closePath();
  context.fill();
}
