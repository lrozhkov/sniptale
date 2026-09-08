import { isCameraAppearance } from './appearance';
import { applyVideoProjectClipsPatch } from '../mutation';
import type { VideoProject, VideoProjectVideoClip } from '../types';
import {
  activeCameraPosition,
  cameraSourceTime,
  canAddCameraPosition,
  resolveCameraClip,
  type CameraPositionEdit,
} from './animation';

export function editCameraPosition(
  project: VideoProject,
  clipId: string,
  time: number,
  edit: CameraPositionEdit
): VideoProject {
  const clip = project.clips.find((item) => item.id === clipId);
  if (
    !clip ||
    clip.type !== 'VIDEO' ||
    edit.kind === 'select' ||
    !project.tracks.some(
      (track) => track.id === clip.trackId && track.role === 'CAMERA' && !track.locked
    )
  )
    return project;
  if (edit.kind === 'appearance') {
    if (!isCameraAppearance(edit.appearance)) return project;
    return applyVideoProjectClipsPatch(
      project,
      project.clips.map((item) =>
        item.id === clipId ? { ...clip, cameraAppearance: { ...edit.appearance } } : item
      )
    );
  }
  let positions = clip.cameraPositions ?? [];
  if (edit.kind === 'add') {
    if (!canAddCameraPosition(project, clipId, time)) return project;
    const visual = resolveCameraClip(clip, time);
    const duration =
      Math.max(0, Math.min(0.5, clip.startTime + clip.duration - 1 / project.fps - time)) *
      (clip.playbackRate ?? 1);
    positions = [
      ...positions,
      {
        id: crypto.randomUUID(),
        sourceTime: cameraSourceTime(clip, time),
        transform: { ...visual.transform },
        fitMode: visual.fitMode,
        transition: {
          kind: duration > 1e-7 ? ('smooth' as const) : ('instant' as const),
          duration,
        },
      },
    ].sort((a, b) => a.sourceTime - b.sourceTime);
  } else if (edit.kind === 'remove') {
    positions = positions.filter((item) => item.id !== edit.id);
  } else {
    const updated = updatePositionTiming(clip, project.fps, edit);
    if (!updated) return project;
    positions = updated;
  }
  if (positions === clip.cameraPositions) return project;
  return applyVideoProjectClipsPatch(
    project,
    project.clips.map((item) =>
      item.id === clipId ? { ...clip, cameraPositions: positions } : item
    )
  );
}

export function cameraPositionSeekTime(
  project: VideoProject,
  clipId: string,
  time: number,
  id?: string | null
): number {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip || clip.type !== 'VIDEO') return time;
  const position =
    id === undefined
      ? activeCameraPosition(clip, time)
      : clip.cameraPositions?.find((item) => item.id === id);
  if (!position) return clip.startTime;
  const next = clip.cameraPositions?.find((item) => item.sourceTime > position.sourceTime);
  const end = Math.min(
    position.sourceTime +
      (position.transition.kind === 'instant' ? 0 : position.transition.duration),
    (next?.sourceTime ?? Infinity) - (clip.playbackRate ?? 1) / project.fps
  );
  return Math.max(
    clip.startTime,
    Math.min(
      clip.startTime + clip.duration - 1 / project.fps,
      clip.startTime + (end - clip.sourceStart) / (clip.playbackRate ?? 1)
    )
  );
}

function updatePositionTiming(
  clip: VideoProjectVideoClip,
  fps: number,
  edit: Extract<CameraPositionEdit, { kind: 'update' }>
) {
  const positions = clip.cameraPositions ?? [];
  const index = positions.findIndex((item) => item.id === edit.id);
  const position = positions[index];
  if (!position) return null;
  const frame = (clip.playbackRate ?? 1) / fps;
  const minimum = Math.max(clip.sourceStart, (positions[index - 1]?.sourceTime ?? -frame) + frame);
  const maximum = Math.min(
    clip.sourceStart + clip.sourceDuration - frame,
    (positions[index + 1]?.sourceTime ?? Infinity) - frame
  );
  if (edit.sourceTime !== undefined && (!Number.isFinite(edit.sourceTime) || minimum > maximum))
    return null;
  if (
    edit.transition &&
    (!Number.isFinite(edit.transition.duration) || edit.transition.duration < 0)
  )
    return null;
  return positions.map((item) =>
    item.id === edit.id
      ? {
          ...item,
          ...(edit.sourceTime === undefined
            ? {}
            : { sourceTime: Math.max(minimum, Math.min(maximum, edit.sourceTime)) }),
          ...(edit.transition
            ? {
                transition: {
                  ...edit.transition,
                  duration: Math.min(clip.sourceDuration, edit.transition.duration),
                },
              }
            : {}),
        }
      : item
  );
}
