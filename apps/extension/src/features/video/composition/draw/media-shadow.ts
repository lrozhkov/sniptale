import type { CameraShadowVector } from '../../project/camera/shadow-direction';
import { MAX_VIDEO_PROJECT_DIMENSION } from '../../project/validation/primitives';
import { roundedWindowRadius } from '../../project/window-geometry';
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

/** Direction is camera-local; this painter retains the receiver viewport/raster transform. */
export function drawMediaFrameShadow(
  context: CanvasRenderingContext2D,
  shadowIntensity: number | undefined,
  shadowMode: VideoMediaShadowMode | undefined,
  frame: VideoMediaShadowFrame,
  displayScale: number,
  appearance?: CameraAppearance,
  camera = false,
  color?: string,
  cornerRadius = 0,
  localDirection?: CameraShadowVector
) {
  const shadow = resolveVideoMediaShadowParams(shadowIntensity, displayScale, shadowMode, camera);
  if (!shadow) {
    return;
  }

  if (localDirection) {
    const distance =
      (2 + (Math.max(0, Math.min(100, shadowIntensity ?? 0)) / 100) * 5) *
      Math.max(0.1, displayScale);
    shadow.offsetX = localDirection.x * distance;
    shadow.offsetY = localDirection.y * distance;
    const bleed = Math.ceil(shadow.blur + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + 2);
    if (
      frame.width + bleed * 2 > MAX_VIDEO_PROJECT_DIMENSION ||
      frame.height + bleed * 2 > MAX_VIDEO_PROJECT_DIMENSION
    )
      return;
  }
  context.save();
  if (color !== undefined) {
    shadow.color = color;
    context.globalAlpha *= Math.max(0, Math.min(100, shadowIntensity ?? 0)) / 100;
  }
  if (shadow.paint.kind === 'outer-shadow') {
    drawOuterMediaFrameShadow(
      context,
      shadow,
      frame,
      appearance,
      cornerRadius,
      localDirection !== undefined
    );
  } else {
    context.shadowBlur = shadow.blur;
    context.shadowColor = shadow.color;
    context.shadowOffsetX = shadow.offsetX;
    context.shadowOffsetY = shadow.offsetY;
    context.fillStyle = shadow.paint.color;
    if (cornerRadius > 0) {
      context.beginPath();
      context.roundRect(frame.x, frame.y, frame.width, frame.height, cornerRadius);
      context.fill();
    } else context.fillRect(frame.x, frame.y, frame.width, frame.height);
  }
  context.restore();
}

function drawOuterMediaFrameShadow(
  context: CanvasRenderingContext2D,
  shadow: NonNullable<ReturnType<typeof resolveVideoMediaShadowParams>>,
  frame: VideoMediaShadowFrame,
  appearance?: CameraAppearance,
  cornerRadius = 0,
  optionalDirectional = false
): void {
  const bleed = Math.ceil(shadow.blur + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + 2);
  let lease: ReturnType<typeof acquireVideoCompositionBuffer>;
  try {
    lease = acquireVideoCompositionBuffer(
      frame.width + bleed * 2,
      frame.height + bleed * 2,
      context.canvas?.ownerDocument
    );
  } catch (error) {
    if (!optionalDirectional) throw error;
    return;
  }
  const maskCanvas = lease?.canvas;
  const maskContext = maskCanvas?.getContext('2d');
  if (!maskCanvas || !maskContext) {
    lease?.release();
    return;
  }

  const fillMaskFrame = () => {
    if (appearance) {
      traceCameraShape(maskContext, { ...frame, x: bleed, y: bleed }, appearance);
      maskContext.fill();
    } else if (cornerRadius > 0) {
      maskContext.beginPath();
      maskContext.roundRect(
        bleed,
        bleed,
        frame.width,
        frame.height,
        roundedWindowRadius(frame.width, frame.height, cornerRadius)
      );
      maskContext.fill();
    } else maskContext.fillRect(bleed, bleed, frame.width, frame.height);
  };

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
    fillMaskFrame();
    maskContext.globalCompositeOperation = 'destination-out';
    maskContext.shadowBlur = 0;
    maskContext.shadowOffsetX = 0;
    maskContext.shadowOffsetY = 0;
    maskContext.fillStyle = 'rgba(0, 0, 0, 1)';
    fillMaskFrame();
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
