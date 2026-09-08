import type { VideoProject, VideoProjectTransform } from '../../../../features/video/project/types';
import { resolveCameraDestinationTransform } from '../../../../features/video/project/camera/animation';
import {
  clampVideoPropertyNumber,
  VIDEO_CLIP_PROPERTY_LIMITS,
} from '../../../project/state/clip-property/constraints';

/** Both disposable canvas feedback and the durable commit use the same bounded destination. */
export function resolveCameraCanvasTransform(
  project: VideoProject,
  clipId: string,
  time: number,
  transform: Partial<VideoProjectTransform>
): Partial<VideoProjectTransform> | null {
  const clip = project.clips.find((item) => item.id === clipId);
  if (
    clip?.type !== 'VIDEO' ||
    !project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
  )
    return transform;
  const destination = resolveCameraDestinationTransform(clip, time, transform);
  if (!destination) return null;
  const limits = VIDEO_CLIP_PROPERTY_LIMITS;
  return {
    x: clampVideoPropertyNumber(destination.x, limits.transformCoordinate),
    y: clampVideoPropertyNumber(destination.y, limits.transformCoordinate),
    width: clampVideoPropertyNumber(destination.width, limits.transformSize),
    height: clampVideoPropertyNumber(destination.height, limits.transformSize),
    rotation: clampVideoPropertyNumber(destination.rotation, limits.transformRotation),
    opacity: clampVideoPropertyNumber(destination.opacity, limits.transformOpacity),
  };
}
