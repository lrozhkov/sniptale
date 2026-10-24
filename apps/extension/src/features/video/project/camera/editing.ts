import { isCameraHiddenRange, MAX_CAMERA_HIDDEN_RANGES } from './visibility';
import {
  isCameraAppearance,
  isCameraCrop,
  DEFAULT_CAMERA_APPEARANCE,
  type CameraCrop,
} from './appearance';
import { applyVideoProjectClipsPatch } from '../mutation';
import type { VideoProject, VideoProjectVideoClip } from '../types';
import {
  effectiveCameraTransitionDuration,
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
  if (edit.kind === 'offset') {
    const timing = clip.cameraTiming;
    if (
      !timing ||
      !Number.isFinite(edit.offsetSeconds) ||
      Math.abs(edit.offsetSeconds) > 86400 ||
      timing.offsetSeconds === edit.offsetSeconds
    )
      return project;
    return applyVideoProjectClipsPatch(
      project,
      project.clips.map((item) =>
        item.id === clipId
          ? { ...clip, cameraTiming: { ...timing, offsetSeconds: edit.offsetSeconds } }
          : item
      )
    );
  }
  if (edit.kind === 'mirror') {
    if (typeof edit.mirrored !== 'boolean' || (clip.cameraMirrored ?? false) === edit.mirrored)
      return project;
    return applyVideoProjectClipsPatch(
      project,
      project.clips.map((item) =>
        item.id === clipId ? { ...clip, cameraMirrored: edit.mirrored } : item
      )
    );
  }
  if (edit.kind === 'crop') return editCameraCrop(project, clip, time, edit.crop);
  if (edit.kind === 'hide' || edit.kind === 'show')
    return editCameraVisibility(project, clip, edit);
  if (edit.kind === 'appearance') {
    if (!isCameraAppearance(edit.appearance)) return project;
    const current = clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE;
    if (
      current.shape === edit.appearance.shape &&
      current.roundness === edit.appearance.roundness &&
      current.zoom === edit.appearance.zoom &&
      current.panX === edit.appearance.panX &&
      current.panY === edit.appearance.panY
    )
      return project;
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
    const activeLayout = activeCameraPosition(clip, time);
    const crop = visual.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE;
    const duration =
      Math.max(0, Math.min(0.5, clip.startTime + clip.duration - 1 / project.fps - time)) *
      (clip.playbackRate ?? 1);
    positions = [
      ...positions,
      {
        id: crypto.randomUUID(),
        ...(positions.some((position) => position.crop !== undefined)
          ? { crop: { zoom: crop.zoom, panX: crop.panX, panY: crop.panY } }
          : {}),
        sourceTime: cameraSourceTime(clip, time),
        ...(activeLayout
          ? { cameraSplit: activeLayout.cameraSplit ?? null }
          : clip.cameraSplit
            ? { cameraSplit: clip.cameraSplit }
            : {}),
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
    position.sourceTime + effectiveCameraTransitionDuration(clip, position),
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
                  duration: Math.min(
                    clip.cameraTiming ? 86400 : clip.sourceDuration,
                    edit.transition.duration
                  ),
                },
              }
            : {}),
        }
      : item
  );
}

function editCameraCrop(
  project: VideoProject,
  clip: VideoProjectVideoClip,
  time: number,
  crop: CameraCrop | null
): VideoProject {
  const position = activeCameraPosition(clip, time);
  const current = position?.crop ?? clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE;
  if (
    crop === null
      ? !position?.crop
      : !isCameraCrop(crop) ||
        (current.zoom === crop.zoom && current.panX === crop.panX && current.panY === crop.panY)
  )
    return project;
  const acceptedCrop =
    crop === null ? undefined : { zoom: crop.zoom, panX: crop.panX, panY: crop.panY };
  const next = position
    ? {
        ...clip,
        cameraPositions:
          clip.cameraPositions?.map((item) => {
            if (item.id !== position.id) return item;
            const changed = { ...item };
            if (acceptedCrop === undefined) delete changed.crop;
            else changed.crop = acceptedCrop;
            return changed;
          }) ?? [],
      }
    : {
        ...clip,
        cameraAppearance: {
          ...(clip.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE),
          ...acceptedCrop,
        },
      };
  return applyVideoProjectClipsPatch(
    project,
    project.clips.map((item) => (item.id === clip.id ? next : item))
  );
}

function editCameraVisibility(
  project: VideoProject,
  clip: VideoProjectVideoClip,
  edit: Extract<CameraPositionEdit, { kind: 'hide' | 'show' }>
): VideoProject {
  const ranges = clip.cameraHiddenRanges ?? [];
  let next: VideoProjectVideoClip;
  if (edit.kind === 'show') {
    if (!ranges.some((range) => range.id === edit.id)) return project;
    const remaining = ranges.filter((range) => range.id !== edit.id);
    next = { ...clip };
    if (remaining.length) next.cameraHiddenRanges = remaining;
    else delete next.cameraHiddenRanges;
  } else {
    const current =
      edit.id === undefined ? undefined : ranges.find((range) => range.id === edit.id);
    const duration = Math.max(
      project.assets.find((asset) => asset.id === clip.assetId)?.metadata.duration ??
        clip.sourceStart + clip.sourceDuration,
      clip.cameraTiming ? clip.sourceStart + clip.sourceDuration : 0,
      ranges.at(-1)?.end ?? 0
    );
    if (
      (edit.id !== undefined && !current) ||
      !isCameraHiddenRange({ id: edit.id ?? 'candidate', start: edit.start, end: edit.end }) ||
      edit.end > duration ||
      (!current && ranges.length >= MAX_CAMERA_HIDDEN_RANGES) ||
      ranges.some(
        (range) => range.id !== current?.id && range.start < edit.end && range.end > edit.start
      )
    )
      return project;
    if (current?.start === edit.start && current.end === edit.end) return project;
    const id = current?.id ?? crypto.randomUUID();
    if (!current && ranges.some((range) => range.id === id)) return project;
    next = {
      ...clip,
      cameraHiddenRanges: [
        ...ranges.filter((range) => range.id !== current?.id),
        { id, start: edit.start, end: edit.end },
      ].sort((a, b) => a.start - b.start),
    };
  }
  return applyVideoProjectClipsPatch(
    project,
    project.clips.map((item) => (item.id === clip.id ? next : item))
  );
}
