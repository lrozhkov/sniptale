import { normalizeClipPlaybackRate } from '../timeline/basics';
import {
  VideoProjectClipType,
  VideoProjectTrackRole,
  type VideoProject,
  type VideoProjectMotionRegion,
  type VideoProjectVideoClip,
} from '../types';
import { isMotionAnimation } from './timing';

type MotionSourceBinding = NonNullable<VideoProjectMotionRegion['sourceBinding']>;

/** Keeps an authored move inside its bound source, shared by the gesture draft and commit. */
export function clampMotionRegionStartTime(
  project: Pick<VideoProject, 'clips' | 'duration'>,
  region: Pick<VideoProjectMotionRegion, 'sourceBinding' | 'duration'>,
  requestedTime: number
): number {
  const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
  const minimum = clip?.type === VideoProjectClipType.VIDEO ? clip.startTime : 0;
  const end =
    clip?.type === VideoProjectClipType.VIDEO ? clip.startTime + clip.duration : project.duration;
  return Math.max(minimum, Math.min(Math.max(minimum, end - region.duration), requestedTime));
}

/** Captures the current authored window against a specific source instance. */
export function bindMotionRegionToClip(
  region: VideoProjectMotionRegion,
  clip: VideoProjectVideoClip
): VideoProjectMotionRegion {
  const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
  return {
    ...region,
    sourceBinding: {
      clipId: clip.id,
      sourceStart: clip.sourceStart + (region.startTime - clip.startTime) * rate,
      sourceEnd: clip.sourceStart + (region.startTime + region.duration - clip.startTime) * rate,
      animation: region.animation ?? { start: 0, end: region.duration, duration: region.duration },
    },
  };
}

/** Automatically binds only an unambiguous visible video, excluding independent camera tracks. */
export function bindMotionRegionToUniqueVideo(
  project: VideoProject,
  region: VideoProjectMotionRegion
): VideoProjectMotionRegion {
  const candidates = getMotionBindingCandidates(project, region);
  return candidates.length === 1 ? bindMotionRegionToClip(region, candidates[0]!) : region;
}

/** Eligible concrete video instances covering the current framing interval. */
export function getMotionBindingCandidates(
  project: VideoProject,
  region: VideoProjectMotionRegion
): VideoProjectVideoClip[] {
  if (region.duration <= 0) return [];
  return project.clips.filter((clip): clip is VideoProjectVideoClip => {
    const track = project.tracks.find((item) => item.id === clip.trackId);
    return (
      clip.type === VideoProjectClipType.VIDEO &&
      track?.visible === true &&
      track.role !== VideoProjectTrackRole.CAMERA &&
      clip.startTime <= region.startTime &&
      clip.startTime + clip.duration >= region.startTime + region.duration
    );
  });
}

/** Reconciles source-bound states once per clip mutation, using explicit split lineage only. */
export function reconcileMotionSourceBindings(
  previous: VideoProject,
  next: VideoProject,
  lineage?: ReadonlyMap<string, string>
): VideoProject {
  if (!next.motionRegions?.some((region) => region.sourceBinding)) return next;
  if (previous.clips === next.clips) {
    if (previous.motionRegions === next.motionRegions) return next;
    return {
      ...next,
      motionRegions: next.motionRegions.map((region) => {
        const original = previous.motionRegions?.find((item) => item.id === region.id);
        if (
          !original?.sourceBinding ||
          region.sourceBinding !== original.sourceBinding ||
          (region.startTime === original.startTime && region.duration === original.duration)
        )
          return region;
        const clip = next.clips.find((item) => item.id === original.sourceBinding?.clipId);
        return clip?.type === VideoProjectClipType.VIDEO
          ? projectMotionSourceBinding(next, bindMotionRegionToClip(region, clip))
          : region;
      }),
    };
  }
  const outgoing = new Map<string, string | null>();
  const regions = next.motionRegions.flatMap((region) => {
    const binding = region.sourceBinding;
    if (!binding) return [region];
    const trailingId = lineage?.get(binding.clipId);
    const leading = projectMotionSourceBinding(next, region);
    if (!next.clips.some((clip) => clip.id === binding.clipId)) return [];
    if (!trailingId) return [leading];
    const trailing = projectMotionSourceBinding(next, {
      ...region,
      id: `${region.id}:${trailingId}`,
      sourceBinding: { ...binding, clipId: trailingId },
    });
    if (trailing.duration <= 0) return [leading];
    outgoing.set(region.id, trailing.id);
    if (leading.duration > 0) {
      const animationGroupId = binding.animationGroupId ?? region.id;
      leading.sourceBinding = { ...binding, animationGroupId };
      trailing.sourceBinding = { ...binding, clipId: trailingId, animationGroupId };
      // Split parts share the authored external entrance; adjacency admits it only on the first visible part.
      trailing.incomingConnection = region.incomingConnection ?? null;
    }
    return [leading, trailing];
  });
  for (const removed of previous.motionRegions ?? []) {
    if (!removed.sourceBinding || regions.some((region) => region.id === removed.id)) continue;
    const groupId = removed.sourceBinding.animationGroupId;
    const survivor = groupId
      ? regions
          .filter((region) => region.sourceBinding?.animationGroupId === groupId)
          .sort((a, b) => (a.animation?.end ?? 0) - (b.animation?.end ?? 0))
          .at(-1)
      : undefined;
    outgoing.set(removed.id, survivor?.id ?? null);
  }
  return {
    ...next,
    motionRegions: regions.map((region) => {
      const connection = region.incomingConnection;
      const replacement = connection && outgoing.get(connection.fromRegionId);
      if (connection && (replacement === null || replacement === region.id)) {
        return { ...region, incomingConnection: null };
      }
      return replacement && replacement !== region.id
        ? { ...region, incomingConnection: { ...connection, fromRegionId: replacement } }
        : region;
    }),
  };
}

/** Parses the authored source interval without accepting a clip chosen by asset identity. */
export function parseMotionSourceBinding(value: unknown): MotionSourceBinding | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('clipId' in value) ||
    typeof value.clipId !== 'string' ||
    value.clipId.length === 0 ||
    ('animationGroupId' in value &&
      (typeof value.animationGroupId !== 'string' || value.animationGroupId.length === 0)) ||
    !('sourceStart' in value) ||
    typeof value.sourceStart !== 'number' ||
    !Number.isFinite(value.sourceStart) ||
    value.sourceStart < 0 ||
    !('sourceEnd' in value) ||
    typeof value.sourceEnd !== 'number' ||
    !Number.isFinite(value.sourceEnd) ||
    value.sourceEnd <= value.sourceStart ||
    !('animation' in value) ||
    !isMotionAnimation(value.animation)
  )
    return null;
  return {
    clipId: value.clipId,
    ...('animationGroupId' in value && typeof value.animationGroupId === 'string'
      ? { animationGroupId: value.animationGroupId }
      : {}),
    sourceStart: value.sourceStart,
    sourceEnd: value.sourceEnd,
    animation: { ...value.animation },
  };
}

/** Projects visible time while retaining the complete source interval for untrim and Undo. */
export function projectMotionSourceBinding(
  project: Pick<VideoProject, 'clips'>,
  region: VideoProjectMotionRegion
): VideoProjectMotionRegion {
  const binding = region.sourceBinding;
  if (!binding) return region;
  const clip = project.clips.find((item) => item.id === binding.clipId);
  if (!clip || clip.type !== VideoProjectClipType.VIDEO) return { ...region, duration: 0 };
  const start = Math.max(binding.sourceStart, clip.sourceStart);
  const end = Math.min(binding.sourceEnd, clip.sourceStart + clip.sourceDuration);
  if (end <= start) return { ...region, startTime: clip.startTime, duration: 0 };
  const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
  const clockScale =
    (binding.animation.end - binding.animation.start) / (binding.sourceEnd - binding.sourceStart);
  return {
    ...region,
    startTime: clip.startTime + (start - clip.sourceStart) / rate,
    duration: (end - start) / rate,
    animation: {
      start: binding.animation.start + (start - binding.sourceStart) * clockScale,
      end: binding.animation.start + (end - binding.sourceStart) * clockScale,
      duration: binding.animation.duration,
    },
  };
}
