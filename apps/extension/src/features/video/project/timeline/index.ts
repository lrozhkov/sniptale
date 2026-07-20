import { getClipEndTime } from './basics';
import { resolveAnchorPlacementClips } from './anchor-clips';
import { applyOverwritePlacement } from './overwrite.helpers.ts';
import { applyVideoProjectClipsPatch } from '../mutation';
import { DEFAULT_LOGICAL_LANE_ID, resolveClipLogicalLaneId } from './logical-lanes';
import {
  VideoTimelinePlacementMode,
  type VideoProject,
  type VideoProjectClip,
} from '../types/index';

const TIMELINE_PLACEMENT_GROUP_SEPARATOR = '\u0000';

function getTimelinePlacementGroupKey(clip: Pick<VideoProjectClip, 'timelineLaneId' | 'trackId'>) {
  return `${clip.trackId}${TIMELINE_PLACEMENT_GROUP_SEPARATOR}${resolveClipLogicalLaneId(clip)}`;
}

function getTrackDefaultPlacementGroupKey(trackId: string) {
  return `${trackId}${TIMELINE_PLACEMENT_GROUP_SEPARATOR}${DEFAULT_LOGICAL_LANE_ID}`;
}

function buildTimelinePlacementGroups(project: VideoProject): Map<string, VideoProjectClip[]> {
  const clipsByPlacementGroup = new Map<string, VideoProjectClip[]>();

  project.tracks.forEach((track) => {
    clipsByPlacementGroup.set(getTrackDefaultPlacementGroupKey(track.id), []);
  });

  project.clips.forEach((clip) => {
    const groupKey = getTimelinePlacementGroupKey(clip);
    const trackClips = clipsByPlacementGroup.get(groupKey);

    if (trackClips) {
      trackClips.push(clip);
      return;
    }

    clipsByPlacementGroup.set(groupKey, [clip]);
  });

  clipsByPlacementGroup.forEach((trackClips) => {
    trackClips.sort((left, right) => left.startTime - right.startTime);
  });

  return clipsByPlacementGroup;
}

function getAnchorShiftDelta(
  anchorClipIdSet: Set<string>,
  anchorClips: VideoProjectClip[],
  clipsByPlacementGroup: Map<string, VideoProjectClip[]>
) {
  return anchorClips.reduce((maxDelta, clip) => {
    const trackClips = clipsByPlacementGroup.get(getTimelinePlacementGroupKey(clip)) ?? [];
    let previousEnd = 0;

    for (const trackClip of trackClips) {
      if (trackClip.id === clip.id) {
        break;
      }

      if (!anchorClipIdSet.has(trackClip.id)) {
        previousEnd = Math.max(previousEnd, getClipEndTime(trackClip));
      }
    }

    return Math.max(maxDelta, Math.max(0, previousEnd - clip.startTime));
  }, 0);
}

function updateRippleTrackPlacements(props: {
  anchorClipIdSet: Set<string>;
  startTimeUpdates: Map<string, number>;
  trackClips: VideoProjectClip[];
}) {
  const trackClips = props.trackClips.map((clip) => {
    const nextStartTime = props.startTimeUpdates.get(clip.id);
    return nextStartTime === undefined ? clip : { ...clip, startTime: nextStartTime };
  });

  let cursor = 0;
  let encounteredAnchor = false;
  trackClips.forEach((clip) => {
    const nextStartTime = props.startTimeUpdates.get(clip.id) ?? clip.startTime;
    if (props.anchorClipIdSet.has(clip.id)) {
      encounteredAnchor = true;
      cursor = Math.max(cursor, nextStartTime + clip.duration);
      return;
    }
    if (!encounteredAnchor) {
      cursor = Math.max(cursor, nextStartTime + clip.duration);
      return;
    }
    const resolvedStartTime = Math.max(nextStartTime, cursor);
    if (Math.abs(resolvedStartTime - clip.startTime) > 0.0001) {
      props.startTimeUpdates.set(clip.id, resolvedStartTime);
    }
    cursor = resolvedStartTime + clip.duration;
  });
}

function applyRipplePushPlacement(project: VideoProject, anchorClipIds: string[]): VideoProject {
  const { anchorClipIdSet, anchorClips } = resolveAnchorPlacementClips(project, anchorClipIds);
  if (anchorClips.length === 0) {
    return project;
  }

  const clipsByPlacementGroup = buildTimelinePlacementGroups(project);
  const startTimeUpdates = new Map<string, number>();
  const anchorDelta = getAnchorShiftDelta(anchorClipIdSet, anchorClips, clipsByPlacementGroup);

  if (anchorDelta > 0) {
    anchorClips.forEach((clip) => {
      startTimeUpdates.set(clip.id, clip.startTime + anchorDelta);
    });
  }

  const affectedGroupKeys = new Set(anchorClips.map(getTimelinePlacementGroupKey));
  affectedGroupKeys.forEach((groupKey) => {
    const trackClips = clipsByPlacementGroup.get(groupKey) ?? [];

    updateRippleTrackPlacements({
      anchorClipIdSet,
      startTimeUpdates,
      trackClips,
    });
  });

  if (startTimeUpdates.size === 0) {
    return project;
  }

  return applyVideoProjectClipsPatch(
    project,
    project.clips.map((clip) => {
      const nextStartTime = startTimeUpdates.get(clip.id);
      return nextStartTime === undefined ? clip : { ...clip, startTime: nextStartTime };
    })
  );
}

export function applyTimelinePlacementPolicy(
  project: VideoProject,
  anchorClipIds: string[]
): VideoProject {
  if (
    anchorClipIds.length === 0 ||
    project.timelinePlacementMode === VideoTimelinePlacementMode.ALLOW_OVERLAP
  ) {
    return project;
  }
  if (project.timelinePlacementMode === VideoTimelinePlacementMode.RIPPLE_PUSH) {
    return applyRipplePushPlacement(project, anchorClipIds);
  }
  return applyOverwritePlacement(project, anchorClipIds);
}

export {
  clampClipPlaybackRate,
  getAssetById,
  getClipEndTime,
  getClipWaveformPeaks,
  getLinkedClipIds,
  getMediaClipSourceTime,
  getSourceTimedClipProjectDuration,
  getSourceTimedClipProjectOffset,
  getSourceTimedClipSourceOffset,
  getSortedTracks,
  getTrackClips,
  getVideoClipSourceTime,
  isAudioClip,
  isClipActiveAtTime,
  isVideoClip,
  syncProjectDuration,
} from './basics';
export {
  getClipCompositeAudioGain,
  getClipCompositeVisualOpacity,
  getClipTransitionOverlapDurations,
  isAnnotationClip,
  isShapeClip,
  isSubtitleClip,
  isTextClip,
  isVisualClip,
} from './presentation';
export {
  buildClipLabel,
  getDefaultExportSettings,
  isSimplePassthroughProject,
  normalizeTrackOrder,
} from './meta';
export {
  assignVideoProjectClipsToLogicalLanes,
  createVideoProjectClipLogicalLaneId,
  createNextVideoProjectTrackLogicalLane,
  createVideoProjectLogicalLane,
  getNextVideoProjectTrackLogicalLaneId,
  getVideoProjectTrackLogicalLaneIds,
  normalizeVideoProjectClipLogicalLaneId,
  normalizeVideoProjectLogicalLanes,
  resolveClipLogicalLaneId,
  DEFAULT_LOGICAL_LANE_ID,
  type VideoProjectClipLogicalLaneAssignment,
} from './logical-lanes';
