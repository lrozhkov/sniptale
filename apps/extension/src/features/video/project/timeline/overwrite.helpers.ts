import { getClipById, getClipEndTime } from './basics';
import { resolveAnchorPlacementClips } from './anchor-clips';
import { applyVideoProjectClipsPatch } from '../mutation';
import {
  mergeClipTimeRanges,
  splitClipAfterOverwrite,
  type ClipTimeRange,
} from './overwrite-segments.helpers.ts';
import { resolveClipLogicalLaneId } from './logical-lanes';
import { VideoClipLinkMode, type VideoProject, type VideoProjectClip } from '../types/index';

function clipsShareTimelinePlacementLane(left: VideoProjectClip, right: VideoProjectClip): boolean {
  return (
    left.trackId === right.trackId &&
    resolveClipLogicalLaneId(left) === resolveClipLogicalLaneId(right)
  );
}

function addClipRemovalIntervalsForAnchors(
  project: VideoProject,
  anchorClipIdSet: Set<string>,
  anchorClips: VideoProjectClip[]
): Map<string, ClipTimeRange[]> {
  const removalIntervalsByClipId = new Map<string, ClipTimeRange[]>();
  const pushRemovalInterval = (clipId: string, range: ClipTimeRange) => {
    const list = removalIntervalsByClipId.get(clipId) ?? [];
    list.push(range);
    removalIntervalsByClipId.set(clipId, list);
  };

  project.clips.forEach((clip) => {
    if (anchorClipIdSet.has(clip.id)) {
      return;
    }

    const laneAnchors = anchorClips
      .filter((anchorClip) => clipsShareTimelinePlacementLane(anchorClip, clip))
      .map((clip) => ({ start: clip.startTime, end: getClipEndTime(clip) }));
    if (laneAnchors.length === 0) {
      return;
    }

    const clipRange = { start: clip.startTime, end: getClipEndTime(clip) };
    mergeClipTimeRanges(laneAnchors).forEach((anchorRange) => {
      const overlapStart = Math.max(clipRange.start, anchorRange.start);
      const overlapEnd = Math.min(clipRange.end, anchorRange.end);
      if (overlapEnd - overlapStart >= 0.0001) {
        pushRemovalInterval(clip.id, {
          start: overlapStart,
          end: overlapEnd,
        });
      }
    });
  });

  return removalIntervalsByClipId;
}

function propagateLinkedRemovalIntervals(
  project: VideoProject,
  anchorClipIdSet: Set<string>,
  removalIntervalsByClipId: Map<string, ClipTimeRange[]>
): void {
  const propagationQueue = [...removalIntervalsByClipId.keys()];
  const seen = new Set<string>();

  while (propagationQueue.length > 0) {
    const clipId = propagationQueue.shift();
    if (!clipId || seen.has(clipId)) {
      continue;
    }

    seen.add(clipId);
    const clip = getClipById(project, clipId);
    if (!clip || !clip.groupId || clip.linkMode !== VideoClipLinkMode.LINKED) {
      continue;
    }

    const intervals = removalIntervalsByClipId.get(clipId) ?? [];
    project.clips
      .filter(
        (item) =>
          item.id !== clip.id &&
          item.groupId === clip.groupId &&
          item.linkMode === VideoClipLinkMode.LINKED &&
          !anchorClipIdSet.has(item.id)
      )
      .forEach((linkedClip) => {
        const existing = removalIntervalsByClipId.get(linkedClip.id) ?? [];
        removalIntervalsByClipId.set(linkedClip.id, [...existing, ...intervals]);
        if (!seen.has(linkedClip.id)) {
          propagationQueue.push(linkedClip.id);
        }
      });
  }
}

export function applyOverwritePlacement(
  project: VideoProject,
  anchorClipIds: string[]
): VideoProject {
  const { anchorClipIdSet, anchorClips } = resolveAnchorPlacementClips(project, anchorClipIds);
  if (anchorClips.length === 0) {
    return project;
  }

  const removalIntervalsByClipId = addClipRemovalIntervalsForAnchors(
    project,
    anchorClipIdSet,
    anchorClips
  );
  propagateLinkedRemovalIntervals(project, anchorClipIdSet, removalIntervalsByClipId);

  if (removalIntervalsByClipId.size === 0) {
    return project;
  }

  const multiSegmentGroupIds = new Map<string, string>();
  const nextClips = project.clips.flatMap((clip) => {
    if (anchorClipIdSet.has(clip.id)) {
      return [clip];
    }

    const removals = removalIntervalsByClipId.get(clip.id);
    if (!removals || removals.length === 0) {
      return [clip];
    }

    return splitClipAfterOverwrite(clip, removals, multiSegmentGroupIds);
  });

  return applyVideoProjectClipsPatch(project, nextClips);
}
