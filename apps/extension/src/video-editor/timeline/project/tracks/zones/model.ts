import { getEffectInstanceLabel } from '../../../../../features/video/project/effect-instance/presentation';
import { getTrackClips } from '../../../../../features/video/project/timeline';
import { VideoTrackKind } from '../../../../../features/video/project/types';
import type { VideoProject } from '../../../../../features/video/project/types';
import { buildVideoEditorTrackGapCandidates } from '../../../../project/operations/timeline-gaps';
import { getTimelineTransitionSummary } from '../../effect-lanes/transition-summary';

interface TimelineZone {
  end: number;
  id: string;
  start: number;
}

export interface TimelineJunctionZone extends TimelineZone {
  locked?: boolean;
  audio?: boolean;
  detail: string;
  label: string;
  stackIndex?: number;
  title: string;
  zoneClassName: string;
  zoneSelectedClassName: string;
}

export interface TimelineCutZone {
  leadingClipId?: string;
  trailingClipId?: string;
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
      ...(leadingClip.type !== 'AUDIO' &&
      trailingClip.type !== 'AUDIO' &&
      !project.tracks.find((track) => track.id === trackId)?.locked
        ? { leadingClipId: leadingClip.id, trailingClipId: trailingClip.id }
        : {}),
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
    if (
      !leadingClip ||
      !trailingClip ||
      leadingClip.trackId !== trackId ||
      trailingClip.trackId !== trackId
    ) {
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
    const instance = project.effectInstances?.find(
      (item) => item.target.kind === 'transition' && item.target.transitionId === transition.id
    );
    const title = instance ? getEffectInstanceLabel(project, instance.id) : summary.title;

    return [
      {
        ...(leadingClip.type === 'AUDIO' ? { audio: true } : {}),
        locked: project.tracks.find((track) => track.id === trackId)?.locked ?? true,
        detail: summary.detail,
        end,
        id: transition.id,
        label: summary.formatDurationLabel(end - start),
        stackIndex: 0,
        start,
        title,
        zoneClassName: summary.zoneClassName,
        zoneSelectedClassName: summary.zoneSelectedClassName,
      },
    ];
  });
}
