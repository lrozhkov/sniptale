import { getTrackClips } from '../../../../../features/video/project/timeline';
import { VideoTrackKind } from '../../../../../features/video/project/types';
import type { VideoProject } from '../../../../../features/video/project/types';
import { buildVideoEditorTrackGapCandidates } from '../../../../project/operations/timeline-gaps';
import { getTimelineTransitionSummary } from '../../effect-lanes/transition-summary';

export interface TimelineZone {
  end: number;
  id: string;
  start: number;
}

export interface TimelineJunctionZone extends TimelineZone {
  detail: string;
  label: string;
  stackIndex?: number;
  title: string;
  zoneClassName: string;
  zoneSelectedClassName: string;
}

export interface TimelineCutZone {
  id: string;
  time: number;
}

export interface TimelineGapZone extends TimelineZone {
  trackId: string;
}

export function buildTrackCutZones(project: VideoProject, trackId: string): TimelineCutZone[] {
  const trackClips = getTrackClips(project, trackId);
  const cutZones: TimelineCutZone[] = [];

  for (let index = 0; index < trackClips.length - 1; index += 1) {
    const leadingClip = trackClips[index];
    const trailingClip = trackClips[index + 1];
    if (!leadingClip || !trailingClip) {
      continue;
    }

    const cutTime = leadingClip.startTime + leadingClip.duration;
    if (Math.abs(trailingClip.startTime - cutTime) > 0.0001) {
      continue;
    }

    cutZones.push({
      id: `cut:${leadingClip.id}:${trailingClip.id}`,
      time: cutTime,
    });
  }

  return cutZones;
}

export function buildTrackGapZones(project: VideoProject, trackId: string): TimelineGapZone[] {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track || (track.kind !== VideoTrackKind.PRIMARY && track.kind !== VideoTrackKind.AUDIO)) {
    return [];
  }

  return buildVideoEditorTrackGapCandidates(project, trackId).map((candidate) => ({
    end: candidate.end,
    id: [
      'gap',
      trackId,
      candidate.leadingClipIds.join('+'),
      candidate.trailingClipIds.join('+'),
    ].join(':'),
    start: candidate.start,
    trackId,
  }));
}

export function buildTrackJunctionZones(
  project: VideoProject,
  trackId: string
): TimelineJunctionZone[] {
  return (project.transitions ?? []).flatMap((transition) => {
    const leadingClip = project.clips.find((clip) => clip.id === transition.leadingClipId);
    const trailingClip = project.clips.find((clip) => clip.id === transition.trailingClipId);
    if (!leadingClip || !trailingClip || leadingClip.trackId !== trackId) {
      return [];
    }

    const start = trailingClip.startTime;
    const end = Math.min(
      leadingClip.startTime + leadingClip.duration,
      trailingClip.startTime + trailingClip.duration
    );
    if (end <= start) {
      return [];
    }

    const summary = getTimelineTransitionSummary(transition);

    return [
      {
        detail: summary.detail,
        end,
        id: transition.id,
        label: summary.formatDurationLabel(end - start),
        stackIndex: 0,
        start,
        title: summary.title,
        zoneClassName: summary.zoneClassName,
        zoneSelectedClassName: summary.zoneSelectedClassName,
      },
    ];
  });
}

export function buildTrackStackedOverlapZones(
  project: VideoProject,
  trackId: string
): TimelineZone[] {
  const currentTrack = project.tracks.find((track) => track.id === trackId);
  if (!currentTrack || currentTrack.kind !== VideoTrackKind.PRIMARY) {
    return [];
  }

  const currentTrackClips = getTrackClips(project, trackId);
  const otherTrackClips = project.tracks
    .filter((track) => track.id !== trackId && track.kind === VideoTrackKind.PRIMARY)
    .flatMap((track) => getTrackClips(project, track.id));

  const overlapZones = currentTrackClips.flatMap((clip) =>
    otherTrackClips.flatMap((otherClip) => {
      const start = Math.max(clip.startTime, otherClip.startTime);
      const end = Math.min(
        clip.startTime + clip.duration,
        otherClip.startTime + otherClip.duration
      );
      if (end <= start) {
        return [];
      }

      return [{ end, id: `${clip.id}:${otherClip.id}`, start }];
    })
  );

  return mergeTimelineZones(overlapZones);
}

function mergeTimelineZones(zones: TimelineZone[]): TimelineZone[] {
  const sortedZones = [...zones].sort(compareTimelineZones);
  const mergedZones: TimelineZone[] = [];

  for (const zone of sortedZones) {
    const previousZone = mergedZones.at(-1);
    if (!previousZone || zone.start > previousZone.end + 0.0001) {
      mergedZones.push(zone);
      continue;
    }

    previousZone.end = Math.max(previousZone.end, zone.end);
    previousZone.id = `${previousZone.id}|${zone.id}`;
  }

  return mergedZones;
}

function compareTimelineZones(left: TimelineZone, right: TimelineZone): number {
  return left.start - right.start || left.end - right.end || left.id.localeCompare(right.id);
}
