import type { CameraSpatialRect } from '../../project/motion/spatial';
import type { VideoCompositionCameraState } from '../types';
import { motionCameraProjection, motionCameraPlaneTransform } from '../motion/spatial';
import { invertQuickEditProjection } from '../motion/spatial-geometry';
import type { ReviewSpatialRenderer } from './spatial-renderer';

/** Capture one contiguous scene group without applying an affine viewport clip first. */
export function drawSpatialCameraGroup(args: {
  camera: VideoCompositionCameraState;
  context: CanvasRenderingContext2D;
  destination: CameraSpatialRect;
  output: { width: number; height: number };
  paint(context: CanvasRenderingContext2D, rasterScale: number): void;
  rasterScale: number;
  renderer: ReviewSpatialRenderer;
  sharp?: boolean;
  sourceRect: CameraSpatialRect;
}): boolean {
  const spatial = args.camera.spatial;
  if (!spatial) return false;
  const scale = args.rasterScale;
  const rect = args.sourceRect;
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    throw new Error('Perspective source bounds are unavailable.');
  const sourceRect = {
    x: Math.floor(rect.x * scale),
    y: Math.floor(rect.y * scale),
    width: Math.ceil((rect.x + rect.width) * scale) - Math.floor(rect.x * scale),
    height: Math.ceil((rect.y + rect.height) * scale) - Math.floor(rect.y * scale),
  };
  if (
    !Object.values(sourceRect).every(Number.isSafeInteger) ||
    sourceRect.width <= 0 ||
    sourceRect.height <= 0
  )
    throw new Error('Perspective source bounds are unavailable.');
  const projection = motionCameraProjection(args.camera, scale);
  if (!projection || !projection.every(Number.isFinite))
    throw new Error('Perspective reference is unavailable.');
  const plane = motionCameraPlaneTransform(args.camera, scale);
  const planeInverse = plane ? invertQuickEditProjection(plane) : null;
  if (plane && !planeInverse) throw new Error('Perspective reference is unavailable.');
  args.renderer.validateSizes(sourceRect, args.output);
  // Both hardware checks precede allocation and painting. The session owns and reuses these named surfaces.
  const output = args.renderer.surface('exposure', args.output.width, args.output.height);
  const source = args.renderer.surface(
    args.sharp ? 'overlay' : 'plane',
    sourceRect.width,
    sourceRect.height
  );
  source.context.save();
  try {
    source.context.setTransform(1, 0, 0, 1, 0, 0);
    source.context.globalAlpha = 1;
    source.context.globalCompositeOperation = 'source-over';
    source.context.filter = 'none';
    source.context.translate(-sourceRect.x, -sourceRect.y);
    args.paint(source.context, scale);
  } finally {
    source.context.restore();
  }
  const base = spatial.reference;
  args.renderer.draw(output.context, {
    source: source.canvas,
    sourceRect,
    output: args.output,
    base: {
      x: base.x * scale,
      y: base.y * scale,
      width: base.width * scale,
      height: base.height * scale,
    },
    target: {
      x: (base.x - args.camera.viewportX) * args.camera.scale * scale,
      y: (base.y - args.camera.viewportY) * args.camera.scale * scale,
      width: base.width * args.camera.scale * scale,
      height: base.height * args.camera.scale * scale,
    },
    frame: spatial,
    projection,
    ...(planeInverse ? { planeInverse } : {}),
    ...(args.sharp === undefined ? {} : { sharp: args.sharp }),
  });
  // Publish only a completed GPU draw. The runtime controls the larger frame transaction.
  args.context.drawImage(
    output.canvas,
    args.destination.x,
    args.destination.y,
    args.destination.width,
    args.destination.height
  );
  return true;
}
