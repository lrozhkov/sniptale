import type { VideoProjectClip, VideoProjectVideoClip, VideoProject } from '../types';
import type { VideoProjectTransform } from '../types/layout';
import type { VideoMediaFitMode } from '../types/media';

export interface CameraPosition {
  id: string;
  /** Source seconds keep the trajectory continuous across trims, splits and rate changes. */
  sourceTime: number;
  transform: VideoProjectTransform;
  fitMode: VideoMediaFitMode;
  transition: { kind: 'instant' | 'smooth' | 'shrink'; duration: number };
}

export type CameraPositionEdit =
  | { kind: 'add' }
  | { kind: 'select'; id: string | null }
  | { kind: 'remove'; id: string }
  | { kind: 'update'; id: string; sourceTime?: number; transition?: CameraPosition['transition'] };

export function cameraSourceTime(clip: VideoProjectVideoClip, time: number): number {
  return (
    clip.sourceStart +
    Math.max(0, Math.min(clip.duration, time - clip.startTime)) * (clip.playbackRate ?? 1)
  );
}

export function activeCameraPosition(
  clip: VideoProjectVideoClip,
  time: number
): CameraPosition | undefined {
  const sourceTime = cameraSourceTime(clip, time);
  return clip.cameraPositions?.findLast((position) => position.sourceTime <= sourceTime + 1e-7);
}

export function resolveCameraClip(
  clip: VideoProjectVideoClip,
  time: number
): VideoProjectVideoClip {
  const sourceTime = cameraSourceTime(clip, time);
  const positions = clip.cameraPositions ?? [];
  let visual = clip;
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    if (!position || position.sourceTime > sourceTime) break;
    const evaluationTime = Math.min(sourceTime, positions[index + 1]?.sourceTime ?? Infinity);
    visual = interpolateCameraPosition(visual, position, evaluationTime);
  }
  return visual;
}

function interpolateCameraPosition(
  clip: VideoProjectVideoClip,
  position: CameraPosition,
  sourceTime: number
): VideoProjectVideoClip {
  const from = clip.transform;
  const duration = position.transition.kind === 'instant' ? 0 : position.transition.duration;
  const progress =
    duration > 0 ? Math.min(1, Math.max(0, (sourceTime - position.sourceTime) / duration)) : 1;
  if (progress === 0) return clip;
  if (progress >= 1) return { ...clip, transform: position.transform, fitMode: position.fitMode };
  const eased = progress * progress * (3 - 2 * progress);
  const mix = (a: number, b: number) => a + (b - a) * eased;
  const scale =
    position.transition.kind === 'shrink' ? 1 - 0.55 * Math.sin(Math.PI * progress) ** 2 : 1;
  const width = mix(from.width, position.transform.width) * scale;
  const height = mix(from.height, position.transform.height) * scale;
  return {
    ...clip,
    // Crop during the move; corner presets end at the source aspect ratio.
    fitMode: 'COVER',
    transform: {
      x:
        mix(from.x + from.width / 2, position.transform.x + position.transform.width / 2) -
        width / 2,
      y:
        mix(from.y + from.height / 2, position.transform.y + position.transform.height / 2) -
        height / 2,
      width,
      height,
      rotation: mix(from.rotation, position.transform.rotation),
      opacity: mix(from.opacity, position.transform.opacity),
    },
  };
}

export function resolveCameraVisualClip(
  project: VideoProject,
  clip: VideoProjectClip,
  time: number
): VideoProjectClip {
  return clip.type === 'VIDEO' &&
    project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
    ? resolveCameraClip(clip, time)
    : clip;
}

/** Edits a destination; interpolation is only a render concern. */
export function updateCameraPositionVisual(
  clip: VideoProjectVideoClip,
  time: number,
  patch: { transform?: Partial<VideoProjectTransform>; fitMode?: VideoMediaFitMode }
): VideoProjectVideoClip {
  const position = activeCameraPosition(clip, time);
  if (!position)
    return {
      ...clip,
      ...(patch.fitMode ? { fitMode: patch.fitMode } : {}),
      transform: { ...clip.transform, ...patch.transform },
    };
  return {
    ...clip,
    cameraPositions:
      clip.cameraPositions?.map((item) =>
        item.id === position.id
          ? {
              ...item,
              ...(patch.fitMode ? { fitMode: patch.fitMode } : {}),
              transform: { ...item.transform, ...patch.transform },
            }
          : item
      ) ?? [],
  };
}

export function canAddCameraPosition(project: VideoProject, clipId: string, time: number): boolean {
  const clip = project.clips.find((item) => item.id === clipId);
  if (
    !clip ||
    clip.type !== 'VIDEO' ||
    !project.tracks.some(
      (track) => track.id === clip.trackId && track.role === 'CAMERA' && !track.locked
    )
  )
    return false;
  const sourceTime = cameraSourceTime(clip, time);
  return (
    time > clip.startTime &&
    time < clip.startTime + clip.duration &&
    (clip.cameraPositions?.length ?? 0) < 512 &&
    !clip.cameraPositions?.some(
      (item) => Math.abs(item.sourceTime - sourceTime) < (clip.playbackRate ?? 1) / project.fps
    )
  );
}

/** Convert a canvas rectangle back into its destination while preserving this rendered frame. */
export function resolveCameraDestinationTransform(
  clip: VideoProjectVideoClip,
  time: number,
  transform: Partial<VideoProjectTransform>
): VideoProjectTransform | null {
  const position = activeCameraPosition(clip, time);
  const visual = resolveCameraClip(clip, time).transform;
  const desired = { ...visual, ...transform };
  if (!position) return desired;
  const duration = position.transition.kind === 'instant' ? 0 : position.transition.duration;
  const progress =
    duration > 0
      ? Math.min(1, Math.max(0, (cameraSourceTime(clip, time) - position.sourceTime) / duration))
      : 1;
  if (progress >= 1) return desired;
  const weight = progress * progress * (3 - 2 * progress);
  // At the exact transition start the destination has no influence on the displayed frame.
  if (weight < 1e-8) return null;
  const scale =
    position.transition.kind === 'shrink' ? 1 - 0.55 * Math.sin(Math.PI * progress) ** 2 : 1;
  const target = position.transform;
  const width = target.width + (desired.width - visual.width) / (weight * scale);
  const height = target.height + (desired.height - visual.height) / (weight * scale);
  return {
    width,
    height,
    x:
      target.x +
      target.width / 2 +
      (desired.x + desired.width / 2 - visual.x - visual.width / 2) / weight -
      width / 2,
    y:
      target.y +
      target.height / 2 +
      (desired.y + desired.height / 2 - visual.y - visual.height / 2) / weight -
      height / 2,
    rotation: target.rotation + (desired.rotation - visual.rotation) / weight,
    opacity: target.opacity + (desired.opacity - visual.opacity) / weight,
  };
}
