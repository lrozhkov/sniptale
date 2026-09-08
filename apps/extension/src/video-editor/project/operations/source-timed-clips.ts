import { resolveVideoCompositionActionSourceMapping } from '../../../features/video/composition/timeline/frame/actions';
import { mapSourceNormalizedPointToVisualLayer } from '../../../features/video/composition/draw/fitted-media';
import { resolveVideoProjectActionOccurrences } from '../../../features/video/project/action-occurrences';
import {
  getSourceTimedClipProjectDuration,
  normalizeClipPlaybackRate,
} from '../../../features/video/project/timeline/basics';
import { mapSourceTimeToProjectPoint } from '../../../features/video/project/timeline/source-time';
import type {
  VideoProject,
  VideoProjectClip,
  VideoProjectVideoClip,
} from '../../../features/video/project/types/model';
import type {
  VideoProjectActionEvent,
  VideoProjectSourceTimeAnchor,
} from '../../../features/video/project/types/interaction';
import { VideoProjectInteractionTimeBasis } from '../../../features/video/project/types/interaction';
import {
  VideoClipLinkMode,
  VideoProjectClipType,
} from '../../../features/video/project/types/model';
import { projectSourceTimeAnchor, type SourceTimedClip } from './source-timed-anchor-projection';
import { reconcileSourceBoundObjectTracks } from './source-timed-object-tracks';

export type { SourceTimedClip } from './source-timed-anchor-projection';

/** Distinct captured sources available through project materials, including its initial source. */
export function collectProjectRecordingIds(project: VideoProject | null): string[] {
  if (!project) return [];
  const ids = new Set<string>();
  if (project.baseRecordingId) ids.add(project.baseRecordingId);
  for (const asset of project.assets) {
    const id =
      asset.source.kind === 'recording'
        ? asset.source.recordingId
        : asset.source.kind === 'project-asset'
          ? asset.source.originRecordingId
          : null;
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

export function isSourceTimedClip(clip: VideoProjectClip): clip is SourceTimedClip {
  return clip.type === VideoProjectClipType.VIDEO || clip.type === VideoProjectClipType.AUDIO;
}

/** Applies caller-bounded source timing without changing the authored source interval. */
export function updateSourceTimedClipTiming<TClip extends SourceTimedClip>(
  clip: TClip,
  patch: Partial<Pick<TClip, 'playbackRate' | 'sourceDuration' | 'sourceStart' | 'startTime'>>
): TClip {
  const playbackRate = normalizeClipPlaybackRate(patch.playbackRate ?? clip.playbackRate ?? 1);
  const sourceDuration = patch.sourceDuration ?? clip.sourceDuration;

  return {
    ...clip,
    ...patch,
    playbackRate,
    sourceDuration,
    sourceStart: Math.max(0, patch.sourceStart ?? clip.sourceStart),
    duration: getSourceTimedClipProjectDuration({ playbackRate, sourceDuration }),
  };
}

export function getSourceEnd(clip: SourceTimedClip) {
  return clip.sourceStart + clip.sourceDuration;
}

export function getSourceUnitKey(clip: SourceTimedClip) {
  return clip.groupId !== null && clip.linkMode === VideoClipLinkMode.LINKED
    ? clip.groupId
    : clip.id;
}

export function isRecordingSourceTimedClip(
  project: VideoProject,
  clip: VideoProjectClip,
  recordingId: string
): clip is SourceTimedClip {
  if (!isSourceTimedClip(clip)) {
    return false;
  }

  const asset = project.assets.find((item) => item.id === clip.assetId);
  if (!asset) {
    return false;
  }

  return (
    (asset.source.kind === 'recording' && asset.source.recordingId === recordingId) ||
    (asset.source.kind === 'project-asset' && asset.source.originRecordingId === recordingId)
  );
}

export function collectRecordingSourceUnits(project: VideoProject, recordingId: string) {
  const units = new Map<string, SourceTimedClip[]>();

  for (const clip of project.clips) {
    if (!isRecordingSourceTimedClip(project, clip, recordingId)) {
      continue;
    }

    const key = getSourceUnitKey(clip);
    const existing = units.get(key);
    if (existing) {
      existing.push(clip);
      continue;
    }

    units.set(key, [clip]);
  }

  return [...units.values()].sort(
    (left, right) =>
      left[0]!.sourceStart - right[0]!.sourceStart || left[0]!.startTime - right[0]!.startTime
  );
}

export function collectRepresentativeRecordingSourceClips(
  project: VideoProject,
  recordingId: string
): VideoProjectVideoClip[] {
  const clipMap = new Map<string, VideoProjectVideoClip>();

  for (const clip of project.clips) {
    if (
      clip.type !== VideoProjectClipType.VIDEO ||
      !isRecordingSourceTimedClip(project, clip, recordingId)
    ) {
      continue;
    }

    const key = getSourceUnitKey(clip);
    const current = clipMap.get(key);
    if (!current) {
      clipMap.set(key, clip);
    }
  }

  return [...clipMap.values()].sort(
    (left, right) => left.sourceStart - right.sourceStart || left.startTime - right.startTime
  );
}

function isValidPreviousAnchor(
  anchor: VideoProjectSourceTimeAnchor,
  recordingId: string,
  previousClips: SourceTimedClip[]
): boolean {
  return (
    anchor.recordingId === recordingId &&
    mapSourceTimeToProjectPoint(
      previousClips.filter((clip) => clip.id === anchor.sourceClipId),
      anchor.sourceTime,
      anchor.sourceClipId
    ) !== null
  );
}

function withoutSourceAnchor<T extends { sourceAnchor?: VideoProjectSourceTimeAnchor }>(
  value: T
): T {
  const nextValue = {
    ...value,
    timeBasis: VideoProjectInteractionTimeBasis.PROJECT,
  };
  delete nextValue.sourceAnchor;
  return nextValue;
}

function hasSourceTimelineChanged(
  previousClips: SourceTimedClip[],
  nextClips: SourceTimedClip[]
): boolean {
  if (previousClips.length !== nextClips.length) {
    return true;
  }

  return previousClips.some((clip, index) => {
    const nextClip = nextClips[index];
    return (
      !nextClip ||
      clip.id !== nextClip.id ||
      clip.startTime !== nextClip.startTime ||
      clip.sourceStart !== nextClip.sourceStart ||
      clip.sourceDuration !== nextClip.sourceDuration ||
      normalizeClipPlaybackRate(clip.playbackRate ?? 1) !==
        normalizeClipPlaybackRate(nextClip.playbackRate ?? 1)
    );
  });
}

function reconcileActionEvents(nextProject: VideoProject): VideoProjectActionEvent[] {
  const events = nextProject.actionEvents.filter((event) => {
    const anchor = event.anchor;
    return (
      anchor.kind === 'project' ||
      nextProject.clips.some(
        (clip) =>
          clip.type === 'VIDEO' &&
          clip.sourceInstanceId === anchor.sourceInstanceId &&
          isRecordingSourceTimedClip(nextProject, clip, anchor.recordingId)
      )
    );
  });
  return events.length === nextProject.actionEvents.length ? nextProject.actionEvents : events;
}

function reconcileCursorTrack(
  previousProject: VideoProject,
  nextProject: VideoProject,
  timelines: Map<string, RecordingClipTimeline>,
  splitLineage?: ReadonlyMap<string, string>
): VideoProject['cursorTrack'] {
  if (nextProject.cursorTrack !== previousProject.cursorTrack || nextProject.cursorTrack === null) {
    return nextProject.cursorTrack;
  }

  const samples = nextProject.cursorTrack.samples
    .flatMap((sample) => {
      if (!sample.sourceAnchor) {
        return [sample];
      }
      const recordingId = sample.sourceAnchor.recordingId;
      const { previousClips, nextClips } = timelines.get(recordingId) ?? {
        previousClips: [],
        nextClips: [],
      };
      if (!isValidPreviousAnchor(sample.sourceAnchor, recordingId, previousClips)) {
        return [withoutSourceAnchor(sample)];
      }

      const projection = projectSourceTimeAnchor(
        sample.sourceAnchor,
        recordingId,
        previousClips,
        nextClips,
        splitLineage
      );
      return projection
        ? [{ ...sample, sourceAnchor: projection.anchor, time: projection.time }]
        : [];
    })
    .sort((left, right) => left.time - right.time);

  return samples.length > 0 ? { ...nextProject.cursorTrack, samples } : null;
}

function reconcileMotionRegions(
  previousProject: VideoProject,
  nextProject: VideoProject,
  splitLineage?: ReadonlyMap<string, string>
): VideoProject['motionRegions'] {
  const occurrences = resolveVideoProjectActionOccurrences(nextProject);
  const regions = nextProject.motionRegions;
  const nextRegions = regions?.map((region) => {
    const target = region.targetAction;
    if (!target) return region;
    if (
      occurrences.some((item) => item.eventId === target.eventId && item.clipId === target.clipId)
    )
      return region;
    const trailingClipId = target.clipId ? splitLineage?.get(target.clipId) : null;
    const descendant =
      trailingClipId &&
      occurrences.find((item) => item.eventId === target.eventId && item.clipId === trailingClipId);
    if (descendant)
      return {
        ...region,
        targetAction: { eventId: descendant.eventId, clipId: descendant.clipId },
      };
    const previous = previousProject.motionRegions?.find((item) => item.id === region.id);
    const previousOccurrence = resolveVideoProjectActionOccurrences(previousProject).find(
      (item) => item.eventId === target.eventId && item.clipId === target.clipId
    );
    const point = previousOccurrence?.event.presentation?.point ?? previousOccurrence?.event.point;
    const mapping =
      previousOccurrence &&
      resolveVideoCompositionActionSourceMapping(
        previousProject,
        previousOccurrence,
        previousOccurrence.time
      );
    const frozenPoint =
      point && previousOccurrence?.clipId === null
        ? point
        : mapping && point
          ? mapSourceNormalizedPointToVisualLayer({ ...mapping, point })
          : null;
    return {
      ...region,
      targetAction: null,
      focusMode: 'MANUAL' as const,
      focusPoint: frozenPoint ?? previous?.focusPoint ?? region.focusPoint,
    };
  });
  return nextRegions?.every((region, index) => region === regions?.[index]) ? regions : nextRegions;
}

interface RecordingClipTimeline {
  previousClips: SourceTimedClip[];
  nextClips: SourceTimedClip[];
}

function collectRecordingClipTimelines(previousProject: VideoProject, nextProject: VideoProject) {
  const recordingIds = new Set<string>();
  for (const asset of previousProject.assets) {
    const recordingId =
      asset.source.kind === 'recording'
        ? asset.source.recordingId
        : asset.source.kind === 'project-asset'
          ? asset.source.originRecordingId
          : null;
    if (recordingId) recordingIds.add(recordingId);
  }
  return new Map(
    [...recordingIds].map((recordingId) => [
      recordingId,
      {
        previousClips: collectRepresentativeRecordingSourceClips(previousProject, recordingId),
        nextClips: collectRepresentativeRecordingSourceClips(nextProject, recordingId),
      },
    ])
  );
}

export function reconcileRecordingInteractionAnchors(
  previousProject: VideoProject,
  nextProject: VideoProject,
  splitLineage?: ReadonlyMap<string, string>
): VideoProject {
  if (previousProject.id !== nextProject.id) return nextProject;
  const timelines = collectRecordingClipTimelines(previousProject, nextProject);
  const events = reconcileActionEvents(nextProject);
  const motionRegions = reconcileMotionRegions(
    previousProject,
    { ...nextProject, actionEvents: events },
    splitLineage
  );
  let objectTracks = nextProject.objectTracks;
  if (objectTracks !== undefined && objectTracks === previousProject.objectTracks) {
    for (const [recordingId, { previousClips, nextClips }] of timelines) {
      if (!hasSourceTimelineChanged(previousClips, nextClips)) continue;
      objectTracks =
        reconcileSourceBoundObjectTracks({
          nextClips,
          nextProject: { ...nextProject, objectTracks },
          previousClips,
          previousProject: { ...previousProject, objectTracks },
          recordingId,
          ...(splitLineage === undefined ? {} : { splitLineage }),
        }) ?? [];
    }
  }
  return {
    ...nextProject,
    actionEvents: events,
    cursorTrack: reconcileCursorTrack(previousProject, nextProject, timelines, splitLineage),
    ...(objectTracks === undefined ? {} : { objectTracks }),
    ...(motionRegions === undefined ? {} : { motionRegions }),
  };
}
