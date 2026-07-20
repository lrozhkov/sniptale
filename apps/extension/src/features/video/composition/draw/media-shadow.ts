import { resolveVideoMediaShadowParams } from '../canvas/media-shadow';
import type { VideoMediaShadowMode } from '../../project/types';

interface VideoMediaShadowFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

type ShadowMaskCanvas = CanvasImageSource & {
  height: number;
  width: number;
  getContext(contextId: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
};

export function drawMediaFrameShadow(
  context: CanvasRenderingContext2D,
  shadowIntensity: number | undefined,
  shadowMode: VideoMediaShadowMode | undefined,
  frame: VideoMediaShadowFrame,
  displayScale: number
) {
  const shadow = resolveVideoMediaShadowParams(shadowIntensity, displayScale, shadowMode);
  if (!shadow) {
    return;
  }

  context.save();
  if (shadow.paint.kind === 'outer-shadow') {
    drawOuterMediaFrameShadow(context, shadow, frame);
  } else {
    context.shadowBlur = shadow.blur;
    context.shadowColor = shadow.color;
    context.shadowOffsetX = shadow.offsetX;
    context.shadowOffsetY = shadow.offsetY;
    context.fillStyle = shadow.paint.color;
    context.fillRect(frame.x, frame.y, frame.width, frame.height);
  }
  context.restore();
}

function drawOuterMediaFrameShadow(
  context: CanvasRenderingContext2D,
  shadow: NonNullable<ReturnType<typeof resolveVideoMediaShadowParams>>,
  frame: VideoMediaShadowFrame
): void {
  const bleed = Math.ceil(shadow.blur + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + 2);
  const maskCanvas = createShadowMaskCanvas(
    frame.width + bleed * 2,
    frame.height + bleed * 2,
    context
  );
  const maskContext = maskCanvas?.getContext('2d');
  if (!maskCanvas || !maskContext) {
    return;
  }

  maskContext.save();
  maskContext.shadowBlur = shadow.blur;
  maskContext.shadowColor = shadow.color;
  maskContext.shadowOffsetX = shadow.offsetX;
  maskContext.shadowOffsetY = shadow.offsetY;
  maskContext.fillStyle = shadow.paint.color;
  maskContext.fillRect(bleed, bleed, frame.width, frame.height);
  maskContext.globalCompositeOperation = 'destination-out';
  maskContext.shadowBlur = 0;
  maskContext.shadowOffsetX = 0;
  maskContext.shadowOffsetY = 0;
  maskContext.fillStyle = 'rgba(0, 0, 0, 1)';
  maskContext.fillRect(bleed, bleed, frame.width, frame.height);
  maskContext.restore();

  context.drawImage(maskCanvas, frame.x - bleed, frame.y - bleed);
}

function createShadowMaskCanvas(
  width: number,
  height: number,
  context: CanvasRenderingContext2D
): ShadowMaskCanvas | null {
  const ownerDocument = context.canvas?.ownerDocument;
  if (ownerDocument) {
    const canvas = ownerDocument.createElement('canvas');
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    return canvas;
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(Math.ceil(width), Math.ceil(height));
  }

  return null;
}
