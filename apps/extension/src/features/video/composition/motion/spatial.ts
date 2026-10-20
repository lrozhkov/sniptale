import { quickEditPlaneProjection } from './spatial-geometry';
import { hasCameraPerspective, interpolateCameraSpatial } from '../../project/motion/spatial';
import type { MotionSpatialSettings, CameraSpatialRect } from '../../project/motion/spatial';
import type { VideoCompositionCameraState } from '../types';

/** Montage owns its canvas reference and clock; shared interpolation owns only the pose. */
export function evaluateMotionSpatial(
  project: { width: number; height: number },
  from: MotionSpatialSettings | null,
  to: MotionSpatialSettings,
  progress: number
): VideoCompositionCameraState['spatial'] {
  if (
    !hasCameraPerspective(from?.perspective) &&
    !hasCameraPerspective(to.perspective) &&
    !from?.depthOfField?.enabled &&
    !to.depthOfField?.enabled
  )
    return undefined;
  const canvas = { x: 0, y: 0, width: 1, height: 1 };
  const right = to.spatialReference ?? canvas;
  // Entrance and exit retain their own plane, as in Gallery. A link blends two authored planes.
  const left = from ? (from.spatialReference ?? canvas) : right;
  const t = Math.max(0, Math.min(1, progress));
  const mix = (a: number, b: number) => a + (b - a) * t;
  const reference: CameraSpatialRect = {
    x: mix(left.x, right.x) * project.width,
    y: mix(left.y, right.y) * project.height,
    width: mix(left.width, right.width) * project.width,
    height: mix(left.height, right.height) * project.height,
  };
  return { ...interpolateCameraSpatial(from, to, t), reference };
}

/** Project-coordinate homography for the same plane that preview and export render. */
export function motionCameraProjection(camera: VideoCompositionCameraState, rasterScale = 1) {
  const spatial = camera.spatial;
  if (!spatial) return null;
  const reference = spatial.reference;
  const base = {
    x: reference.x * rasterScale,
    y: reference.y * rasterScale,
    width: reference.width * rasterScale,
    height: reference.height * rasterScale,
  };
  return quickEditPlaneProjection(
    base,
    {
      x: (base.x - camera.viewportX * rasterScale) * camera.scale,
      y: (base.y - camera.viewportY * rasterScale) * camera.scale,
      width: base.width * camera.scale,
      height: base.height * camera.scale,
    },
    spatial
  );
}
