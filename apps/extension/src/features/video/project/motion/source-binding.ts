import { mapSourceRangeToProjectSpans } from '../timeline/source-time';
import { normalizeClipPlaybackRate } from '../timeline/basics';
import { getClipPlaybackOffset } from '../timeline/rate';
import {
  VideoProjectClipType,
  VideoProjectTrackRole,
  type VideoProject,
  type VideoProjectMotionRegion,
  type VideoProjectVideoClip,
} from '../types';
import { isMotionAnimation, motionTransitionSettings } from './timing';
import { projectSourceFocusPhases, type SourceFocusSpan } from './source-phase-projection';

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
  if (region.sourceBinding?.dormant)
    return { ...region, sourceBinding: { ...region.sourceBinding, clipId: clip.id } };
  const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
  return {
    ...region,
    sourceBinding: {
      ...(region.sourceBinding?.unresolvedLinkTo !== undefined
        ? { unresolvedLinkTo: region.sourceBinding.unresolvedLinkTo }
        : {}),
      ...(region.sourceBinding?.dormant !== undefined
        ? { dormant: region.sourceBinding.dormant }
        : {}),
      ...(region.sourceBinding?.phaseProjection
        ? {
            phaseProjection: region.sourceBinding.phaseProjection,
            animationGroupId: region.sourceBinding.animationGroupId,
          }
        : {}),
      ...(region.sourceBinding?.coordinateSpace
        ? { coordinateSpace: region.sourceBinding.coordinateSpace }
        : {}),
      clipId: clip.id,
      sourceStart:
        clip.sourceStart +
        (clip.playbackWindow
          ? getClipPlaybackOffset(clip, region.startTime)
          : region.startTime - clip.startTime) *
          rate,
      sourceEnd:
        clip.sourceStart +
        (clip.playbackWindow
          ? getClipPlaybackOffset(clip, region.startTime + region.duration)
          : region.startTime + region.duration - clip.startTime) *
          rate,
      animation: region.sourceBinding?.phaseProjection
        ? { start: 0, end: region.duration * rate, duration: region.duration * rate }
        : (region.animation ?? { start: 0, end: region.duration, duration: region.duration }),
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
      (region.border !== undefined ||
        region.spotlight !== undefined ||
        track.role !== VideoProjectTrackRole.CAMERA) &&
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
    const hasRetainedSpan = (part: VideoProjectMotionRegion) =>
      binding.dormant
        ? projectMotionSourceBinding(next, {
            ...part,
            sourceBinding: { ...binding, clipId: part.sourceBinding!.clipId, dormant: false },
          }).duration > 0
        : part.duration > 0;
    if (!hasRetainedSpan(trailing)) return [leading];
    outgoing.set(region.id, trailing.id);
    if (hasRetainedSpan(leading)) {
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
    ('phaseProjection' in value && value.phaseProjection !== 'retained-result') ||
    ('coordinateSpace' in value && value.coordinateSpace !== 'source-window') ||
    ('dormant' in value && typeof value.dormant !== 'boolean') ||
    ('unresolvedLinkTo' in value &&
      (typeof value.unresolvedLinkTo !== 'string' || value.unresolvedLinkTo.length === 0)) ||
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
    ...('unresolvedLinkTo' in value && typeof value.unresolvedLinkTo === 'string'
      ? { unresolvedLinkTo: value.unresolvedLinkTo }
      : {}),
    ...('dormant' in value && typeof value.dormant === 'boolean' ? { dormant: value.dormant } : {}),
    ...('animationGroupId' in value && typeof value.animationGroupId === 'string'
      ? { animationGroupId: value.animationGroupId }
      : {}),
    ...('phaseProjection' in value && value.phaseProjection === 'retained-result'
      ? { phaseProjection: value.phaseProjection }
      : {}),
    ...('coordinateSpace' in value && value.coordinateSpace === 'source-window'
      ? { coordinateSpace: value.coordinateSpace }
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
  if (binding.dormant) return { ...region, startTime: clip.startTime, duration: 0 };
  const span = clip.playbackWindow
    ? mapSourceRangeToProjectSpans([clip], binding.sourceStart, binding.sourceEnd)[0]
    : undefined;
  if (clip.playbackWindow && !span) return { ...region, startTime: clip.startTime, duration: 0 };
  const start = span?.sourceStart ?? Math.max(binding.sourceStart, clip.sourceStart);
  const end = Math.min(
    binding.sourceEnd,
    clip.sourceStart +
      Math.min(
        clip.sourceDuration,
        clip.playbackWindow
          ? (clip.playbackWindow.offset + clip.duration) *
              normalizeClipPlaybackRate(clip.playbackRate ?? 1)
          : clip.sourceDuration
      )
  );
  if (end <= start) return { ...region, startTime: clip.startTime, duration: 0 };
  const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
  const animationTime = (sourceTime: number): number => {
    // Preserve exact authored endpoints: multiply-by-clock-scale can overshoot by one ULP.
    if (sourceTime === binding.sourceStart) return binding.animation.start;
    if (sourceTime === binding.sourceEnd) return binding.animation.end;
    const progress = (sourceTime - binding.sourceStart) / (binding.sourceEnd - binding.sourceStart);
    return Math.max(
      binding.animation.start,
      Math.min(
        binding.animation.end,
        binding.animation.start + progress * (binding.animation.end - binding.animation.start)
      )
    );
  };
  return {
    ...region,
    startTime: span?.startTime ?? clip.startTime + (start - clip.sourceStart) / rate,
    duration: span ? span.endTime - span.startTime : (end - start) / rate,
    animation: {
      start: animationTime(start),
      end: animationTime(end),
      duration: binding.animation.duration,
    },
  };
}

const phaseViews = new WeakMap<VideoProject, VideoProject>();
const phaseSources = new WeakMap<VideoProject, VideoProject>();

/** Derives render-only Gallery phases; source controls remain unchanged in the document. */
export function projectMotionSourcePhases(project: VideoProject): VideoProject {
  if (
    !project.motionRegions?.some(
      (region) =>
        region.sourceBinding?.phaseProjection ||
        project.clips.some(
          (clip) => clip.id === region.sourceBinding?.clipId && clip.playbackWindow
        )
    )
  )
    return project;
  const previous = phaseViews.get(project);
  if (previous) return previous;
  const regions = project.motionRegions;
  const view = {
    ...project,
    motionRegions: regions.map((region) => {
      const binding = region.sourceBinding;
      if (!binding) return region;
      const clip = project.clips.find((item) => item.id === binding.clipId);
      if (!binding.phaseProjection)
        return clip?.playbackWindow ? projectMotionSourceBinding(project, region) : region;
      const projected = projectMotionSourceBinding(project, region);
      const { phaseProjection: _policy, ...renderBinding } = binding;
      // Borders consume the retained source clock, including their raw phase boundaries.
      if (region.border || projected.duration <= 0)
        return { ...projected, sourceBinding: renderBinding };
      if (!clip || clip.type !== VideoProjectClipType.VIDEO) return projected;
      const group = binding.animationGroupId;
      const clipIds = new Set(
        regions
          .filter(
            (item) =>
              item.id === region.id ||
              (group !== undefined && item.sourceBinding?.animationGroupId === group)
          )
          .map((item) => item.sourceBinding?.clipId)
      );
      const clips = project.clips
        .filter(
          (item): item is VideoProjectVideoClip =>
            item.type === VideoProjectClipType.VIDEO &&
            clipIds.has(item.id) &&
            item.trackId === clip.trackId &&
            item.assetId === clip.assetId &&
            item.sourceInstanceId === clip.sourceInstanceId
        )
        .toSorted((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
      const index = clips.findIndex((item) => item.id === clip.id);
      const touches = (a: VideoProjectVideoClip, b: VideoProjectVideoClip) =>
        Math.abs(a.startTime + a.duration - b.startTime) < 0.000001 &&
        a.sourceStart + a.sourceDuration <= b.sourceStart + 0.000001;
      let first = index,
        last = index;
      while (first > 0 && touches(clips[first - 1]!, clips[first]!)) first--;
      while (last + 1 < clips.length && touches(clips[last]!, clips[last + 1]!)) last++;
      const visible: SourceFocusSpan[] = clips.slice(first, last + 1).map((item) => {
        const rate = normalizeClipPlaybackRate(item.playbackRate ?? 1);
        const start = item.startTime - (item.playbackWindow?.offset ?? 0);
        return {
          sourceStart: item.sourceStart,
          sourceEnd: item.sourceStart + item.sourceDuration,
          start,
          end: item.playbackWindow
            ? start + item.sourceDuration / rate
            : item.startTime + item.duration,
          rate,
        };
      });
      const phaseVisible = clip.playbackWindow
        ? [...new Map(visible.map((part) => [JSON.stringify(part), part])).values()]
        : visible;
      const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
      const window = clip.playbackWindow;
      const origin = clip.startTime - (window?.offset ?? 0);
      const contentStart = window
        ? origin +
          (Math.max(
            binding.sourceStart,
            clip.sourceStart + Math.min(window.offset, window.holdAt ?? Infinity) * rate
          ) -
            clip.sourceStart) /
            rate
        : projected.startTime;
      const contentEnd = window
        ? origin +
          (Math.min(
            binding.sourceEnd,
            clip.sourceStart + Math.min(clip.sourceDuration, (window.offset + clip.duration) * rate)
          ) -
            clip.sourceStart) /
            rate
        : projected.startTime + projected.duration;
      const spans = projectSourceFocusPhases(
        {
          sourceStart: binding.sourceStart,
          sourceEnd: binding.sourceEnd,
          enter: motionTransitionSettings(region, 'enter'),
          exit: motionTransitionSettings(region, 'exit'),
        },
        phaseVisible
      );
      const span = spans.find(
        (item) => contentStart >= item.start - 0.000001 && contentEnd <= item.end + 0.000001
      );
      if (!span) return { ...projected, sourceBinding: renderBinding, duration: 0 };
      return {
        ...projected,
        sourceBinding: renderBinding,
        animation: {
          start: Math.max(0, contentStart - span.start),
          end: Math.min(span.end - span.start, contentEnd - span.start),
          duration: span.end - span.start,
        },
        zoomInDuration: span.enter.duration,
        zoomOutDuration: span.exit.duration,
        phaseTransitions: { enter: span.enter.type, exit: span.exit.type },
      };
    }),
  };
  // Projects are immutable snapshots; the disposable view shares their lifetime.
  phaseSources.set(view, project);
  phaseViews.set(project, view);
  phaseViews.set(view, view);
  return view;
}

/** Returns the source snapshot for a disposable phase view without exposing its cache. */
export function getMotionPhaseSource(project: VideoProject): VideoProject {
  return phaseSources.get(project) ?? project;
}
