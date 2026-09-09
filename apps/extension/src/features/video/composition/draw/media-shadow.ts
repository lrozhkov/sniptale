import { acquireVideoCompositionBuffer } from '../canvas/buffer-pool';
import { cameraSilhouette, type CameraAppearance } from '../../project/camera/appearance';
import { resolveVideoMediaShadowParams } from '../canvas/media-shadow';
import type { VideoMediaShadowMode } from '../../project/types';

interface VideoMediaShadowFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function drawMediaFrameShadow(
  context: CanvasRenderingContext2D,
  shadowIntensity: number | undefined,
  shadowMode: VideoMediaShadowMode | undefined,
  frame: VideoMediaShadowFrame,
  displayScale: number,
  appearance?: CameraAppearance,
  camera = false
) {
  const shadow = resolveVideoMediaShadowParams(shadowIntensity, displayScale, shadowMode, camera);
  if (!shadow) {
    return;
  }

  context.save();
  if (shadow.paint.kind === 'outer-shadow') {
    drawOuterMediaFrameShadow(context, shadow, frame, appearance);
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
  frame: VideoMediaShadowFrame,
  appearance?: CameraAppearance
): void {
  const bleed = Math.ceil(shadow.blur + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + 2);
  const lease = acquireVideoCompositionBuffer(
    frame.width + bleed * 2,
    frame.height + bleed * 2,
    context.canvas?.ownerDocument
  );
  const maskCanvas = lease?.canvas;
  const maskContext = maskCanvas?.getContext('2d');
  if (!maskCanvas || !maskContext) {
    lease?.release();
    return;
  }

  try {
    maskContext.reset?.();
    maskContext.save();
    maskContext.setTransform(1, 0, 0, 1, 0, 0);
    maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskContext.globalCompositeOperation = 'source-over';
    maskContext.shadowBlur = shadow.blur;
    maskContext.shadowColor = shadow.color;
    maskContext.shadowOffsetX = shadow.offsetX;
    maskContext.shadowOffsetY = shadow.offsetY;
    maskContext.fillStyle = shadow.paint.color;
    if (appearance) {
      traceCameraShape(maskContext, { ...frame, x: bleed, y: bleed }, appearance);
      maskContext.fill();
    } else maskContext.fillRect(bleed, bleed, frame.width, frame.height);
    maskContext.globalCompositeOperation = 'destination-out';
    maskContext.shadowBlur = 0;
    maskContext.shadowOffsetX = 0;
    maskContext.shadowOffsetY = 0;
    maskContext.fillStyle = 'rgba(0, 0, 0, 1)';
    if (appearance) {
      traceCameraShape(maskContext, { ...frame, x: bleed, y: bleed }, appearance);
      maskContext.fill();
    } else maskContext.fillRect(bleed, bleed, frame.width, frame.height);
    context.drawImage(maskCanvas, frame.x - bleed, frame.y - bleed);
  } finally {
    maskContext.restore();
    lease!.release();
  }
}

/** The same silhouette clips video and generates the outer shadow mask. */
export function traceCameraShape(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frame: VideoMediaShadowFrame,
  appearance: CameraAppearance
) {
  context.beginPath();
  if (appearance.shape === 'rounded') {
    context.roundRect(
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      (Math.min(frame.width, frame.height) * appearance.roundness) / 200
    );
  } else {
    cameraSilhouette(frame.width, frame.height, appearance).forEach((point, index) => {
      if (index === 0) context.moveTo(frame.x + point.x, frame.y + point.y);
      else context.lineTo(frame.x + point.x, frame.y + point.y);
    });
    context.closePath();
  }
}
