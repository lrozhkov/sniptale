import {
  quickEditPlaneProjection,
  invertQuickEditProjection,
  multiplyQuickEditProjections,
  type QuickEditHomography,
} from './spatial-geometry';
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
  const plane = motionCameraPlaneTransform(camera, rasterScale);
  if (plane) {
    const inverse = invertQuickEditProjection(plane);
    if (!inverse) return null;
    const local = quickEditPlaneProjection(base, base, spatial);
    const deformation = multiplyQuickEditProjections(
      plane,
      multiplyQuickEditProjections(local, inverse)
    );
    const zoom: QuickEditHomography = [
      camera.scale,
      0,
      -camera.viewportX * camera.scale * rasterScale,
      0,
      camera.scale,
      -camera.viewportY * camera.scale * rasterScale,
      0,
      0,
      1,
    ];
    return multiplyQuickEditProjections(zoom, deformation);
  }
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

/** Express the source plane placement in the consuming raster without changing its logical pose. */
export function motionCameraPlaneTransform(
  camera: VideoCompositionCameraState,
  rasterScale = 1
): QuickEditHomography | null {
  const m = camera.spatial?.planeTransform;
  return m
    ? [
        m[0],
        m[1],
        m[2] * rasterScale,
        m[3],
        m[4],
        m[5] * rasterScale,
        m[6] / rasterScale,
        m[7] / rasterScale,
        m[8],
      ]
    : null;
}
