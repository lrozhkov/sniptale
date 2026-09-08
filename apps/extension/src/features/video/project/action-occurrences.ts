import type { VideoProject, VideoProjectActionEvent, VideoProjectVideoClip } from './types';

/** One appearance of an authored fact on the current timeline. Never persisted. */
export interface VideoProjectActionOccurrence {
  event: VideoProjectActionEvent;
  eventId: string;
  clipId: string | null;
  time: number;
  sourceInstanceId: string | null;
  playbackRun: { id: string; clipIds: readonly string[] } | null;
}

const CONTINUITY_EPSILON = 0.000_001;

function touches(left: VideoProjectVideoClip, right: VideoProjectVideoClip): boolean {
  return (
    left.id !== right.id &&
    left.trackId === right.trackId &&
    left.assetId === right.assetId &&
    Math.abs(left.startTime + left.duration - right.startTime) <= CONTINUITY_EPSILON &&
    Math.abs(left.sourceStart + left.sourceDuration - right.sourceStart) <= CONTINUITY_EPSILON
  );
}

function resolveRuns(clips: readonly VideoProjectVideoClip[]) {
  const runs = new Map<string, NonNullable<VideoProjectActionOccurrence['playbackRun']>>();
  const successors = new Map(
    clips.map((left) => [left.id, clips.filter((right) => touches(left, right))])
  );
  const predecessors = new Map(
    clips.map((right) => [right.id, clips.filter((left) => touches(left, right))])
  );
  const linkedNext = (clip: VideoProjectVideoClip) => {
    const next = successors.get(clip.id);
    return next?.length === 1 && predecessors.get(next[0]!.id)?.length === 1 ? next[0] : undefined;
  };
  const linkedPrevious = (clip: VideoProjectVideoClip) => {
    const previous = predecessors.get(clip.id);
    return previous?.length === 1 && successors.get(previous[0]!.id)?.length === 1
      ? previous[0]
      : undefined;
  };
  for (const clip of clips) {
    if (runs.has(clip.id)) continue;
    let first = clip;
    const visited = new Set([first.id]);
    let previous = linkedPrevious(first);
    while (previous && !visited.has(previous.id)) {
      first = previous;
      visited.add(first.id);
      previous = linkedPrevious(first);
    }
    const clipIds: string[] = [];
    let current: VideoProjectVideoClip | undefined = first;
    while (current && !clipIds.includes(current.id)) {
      clipIds.push(current.id);
      current = linkedNext(current);
    }
    const run = { id: first.id, clipIds };
    for (const id of clipIds) runs.set(id, run);
  }
  return runs;
}

/** Resolve every real appearance; a trimmed-away fact deliberately produces no row. */
export function resolveVideoProjectActionOccurrences(
  project: VideoProject
): VideoProjectActionOccurrence[] {
  const instances = new Map<string, VideoProjectVideoClip[]>();
  for (const clip of project.clips) {
    if (clip.type !== 'VIDEO' || !clip.sourceInstanceId) continue;
    const asset = project.assets.find((item) => item.id === clip.assetId);
    const recordingId =
      asset?.source.kind === 'recording'
        ? asset.source.recordingId
        : asset?.source.kind === 'project-asset'
          ? asset.source.originRecordingId
          : null;
    if (!recordingId) continue;
    const key = JSON.stringify([recordingId, clip.sourceInstanceId]);
    const group = instances.get(key) ?? [];
    group.push(clip);
    instances.set(key, group);
  }
  const runs = new Map([...instances].map(([key, clips]) => [key, resolveRuns(clips)]));
  const occurrences = project.actionEvents.flatMap<VideoProjectActionOccurrence>((event) => {
    const anchor = event.anchor;
    if (anchor.kind === 'project') {
      return [
        {
          event,
          eventId: event.id,
          clipId: null,
          time: anchor.time,
          sourceInstanceId: null,
          playbackRun: null,
        },
      ];
    }
    const key = JSON.stringify([anchor.recordingId, anchor.sourceInstanceId]);
    return (instances.get(key) ?? []).flatMap((clip) => {
      if (
        anchor.sourceTime < clip.sourceStart ||
        anchor.sourceTime >= clip.sourceStart + clip.sourceDuration
      )
        return [];
      return [
        {
          event,
          eventId: event.id,
          clipId: clip.id,
          time: clip.startTime + (anchor.sourceTime - clip.sourceStart) / (clip.playbackRate ?? 1),
          sourceInstanceId: anchor.sourceInstanceId,
          playbackRun: runs.get(key)?.get(clip.id) ?? null,
        },
      ];
    });
  });
  return occurrences.sort(
    (a, b) =>
      a.time - b.time ||
      a.eventId.localeCompare(b.eventId) ||
      (a.clipId ?? '').localeCompare(b.clipId ?? '')
  );
}
