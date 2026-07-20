import {
  getClipEndTime,
  getTrackClips,
  resolveClipLogicalLaneId,
} from '../../../features/video/project/timeline';
import type { VideoProject, VideoProjectClip } from '../../../features/video/project/types/model';

const TIMELINE_GAP_EPSILON = 0.0001;

interface VideoEditorTrackGapCandidate {
  end: number;
  leadingClipIds: string[];
  start: number;
  trailingClipIds: string[];
}

interface VideoEditorTrackTimingUnit {
  clipIds: string[];
  end: number;
  start: number;
}

export function buildVideoEditorTrackGapCandidates(
  project: VideoProject,
  trackId: string
): VideoEditorTrackGapCandidate[] {
  const timingUnits = buildTrackTimingUnits(project, trackId);
  const unitStartTimes = getUniqueSortedUnitStartTimes(timingUnits);

  return unitStartTimes.flatMap((trailingStart) =>
    buildGapCandidateForTrailingStart(timingUnits, trailingStart)
  );
}

function buildTrackTimingUnits(
  project: VideoProject,
  trackId: string
): VideoEditorTrackTimingUnit[] {
  const clips = getTrackClips(project, trackId);
  const clipById = new Map(clips.map((clip) => [clip.id, clip]));
  const linkedClipIds = getTransitionLinkedClipIds(project, clipById);
  const visitedIds = new Set<string>();

  return clips
    .flatMap((clip) => {
      if (visitedIds.has(clip.id)) {
        return [];
      }

      const unitClips = collectTransitionConnectedClips(clip, clipById, linkedClipIds, visitedIds);
      return [
        {
          clipIds: unitClips.map((item) => item.id).sort(),
          end: Math.max(...unitClips.map(getClipEndTime)),
          start: Math.min(...unitClips.map((item) => item.startTime)),
        },
      ];
    })
    .sort(compareTimingUnits);
}

function getTransitionLinkedClipIds(
  project: VideoProject,
  clipById: Map<string, VideoProjectClip>
): Map<string, string[]> {
  const linkedClipIds = new Map<string, string[]>();

  for (const transition of project.transitions ?? []) {
    const leadingClip = clipById.get(transition.leadingClipId);
    const trailingClip = clipById.get(transition.trailingClipId);
    if (!leadingClip || !trailingClip || !areClipsOnSameLogicalLane(leadingClip, trailingClip)) {
      continue;
    }

    addLinkedClipId(linkedClipIds, leadingClip.id, trailingClip.id);
    addLinkedClipId(linkedClipIds, trailingClip.id, leadingClip.id);
  }

  return linkedClipIds;
}

function areClipsOnSameLogicalLane(left: VideoProjectClip, right: VideoProjectClip): boolean {
  return (
    left.trackId === right.trackId &&
    resolveClipLogicalLaneId(left) === resolveClipLogicalLaneId(right)
  );
}

function addLinkedClipId(
  linkedClipIds: Map<string, string[]>,
  clipId: string,
  linkedClipId: string
) {
  const current = linkedClipIds.get(clipId);
  if (current) {
    current.push(linkedClipId);
    return;
  }

  linkedClipIds.set(clipId, [linkedClipId]);
}

function collectTransitionConnectedClips(
  clip: VideoProjectClip,
  clipById: Map<string, VideoProjectClip>,
  linkedClipIds: Map<string, string[]>,
  visitedIds: Set<string>
): VideoProjectClip[] {
  const stack = [clip];
  const connectedClips: VideoProjectClip[] = [];

  while (stack.length > 0) {
    const currentClip = stack.pop()!;
    if (visitedIds.has(currentClip.id)) {
      continue;
    }

    visitedIds.add(currentClip.id);
    connectedClips.push(currentClip);
    for (const linkedClipId of linkedClipIds.get(currentClip.id) ?? []) {
      const linkedClip = clipById.get(linkedClipId);
      if (linkedClip && !visitedIds.has(linkedClip.id)) {
        stack.push(linkedClip);
      }
    }
  }

  return connectedClips;
}

function compareTimingUnits(
  left: VideoEditorTrackTimingUnit,
  right: VideoEditorTrackTimingUnit
): number {
  return (
    left.start - right.start ||
    left.end - right.end ||
    left.clipIds.join('+').localeCompare(right.clipIds.join('+'))
  );
}

function getUniqueSortedUnitStartTimes(units: VideoEditorTrackTimingUnit[]): number[] {
  return [...new Set(units.map((unit) => unit.start))].sort((left, right) => left - right);
}

function buildGapCandidateForTrailingStart(
  units: VideoEditorTrackTimingUnit[],
  trailingStart: number
): VideoEditorTrackGapCandidate[] {
  const leadingClipIds = getNearestLeadingClipIds(units, trailingStart);
  const trailingClipIds = getUnitsStartingAt(units, trailingStart).flatMap((unit) => unit.clipIds);
  if (leadingClipIds.length === 0 || trailingClipIds.length === 0) {
    return [];
  }

  const gapStart = Math.max(
    ...units.filter((unit) => hasAnyClipId(unit, leadingClipIds)).map((unit) => unit.end)
  );
  if (trailingStart <= gapStart + TIMELINE_GAP_EPSILON) {
    return [];
  }

  return [{ end: trailingStart, leadingClipIds, start: gapStart, trailingClipIds }];
}

function hasAnyClipId(unit: VideoEditorTrackTimingUnit, clipIds: string[]): boolean {
  return unit.clipIds.some((clipId) => clipIds.includes(clipId));
}

function getNearestLeadingClipIds(
  units: VideoEditorTrackTimingUnit[],
  trailingStart: number
): string[] {
  const leadingUnits = units.filter((unit) => unit.end <= trailingStart - TIMELINE_GAP_EPSILON);
  if (leadingUnits.length === 0) {
    return [];
  }

  const nearestEnd = Math.max(...leadingUnits.map((unit) => unit.end));
  return leadingUnits
    .filter((unit) => Math.abs(unit.end - nearestEnd) <= TIMELINE_GAP_EPSILON)
    .flatMap((unit) => unit.clipIds)
    .sort();
}

function getUnitsStartingAt(units: VideoEditorTrackTimingUnit[], startTime: number) {
  return units.filter((unit) => Math.abs(unit.start - startTime) <= TIMELINE_GAP_EPSILON);
}

export function isMatchingTrackGapCandidate(
  candidate: VideoEditorTrackGapCandidate,
  gapStart: number,
  gapEnd: number
): boolean {
  return (
    Math.abs(candidate.start - gapStart) <= TIMELINE_GAP_EPSILON &&
    Math.abs(candidate.end - gapEnd) <= TIMELINE_GAP_EPSILON
  );
}
