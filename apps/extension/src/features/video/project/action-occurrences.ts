import { areVideoClipSourceClocksContinuous } from './timeline/rate';
import { recordingIdForProjectAsset } from './source-interactions';
import type { VideoProject, VideoProjectActionEvent, VideoProjectVideoClip } from './types';

/** One appearance of an authored fact on the current timeline. Never persisted. */
export interface VideoProjectActionOccurrence {
  event: VideoProjectActionEvent;
  eventId: string;
  clipId: string | null;
  /** Captured down time projected through the owning run, including before a retained tail. */
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
    areVideoClipSourceClocksContinuous(left, right)
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

/** Resolve retained points and observed gesture continuations without moving their source anchors. */
export function resolveVideoProjectActionOccurrences(
  project: VideoProject
): VideoProjectActionOccurrence[] {
  const instances = new Map<string, VideoProjectVideoClip[]>();
  for (const clip of project.clips) {
    if (clip.type !== 'VIDEO' || !clip.sourceInstanceId) continue;
    const asset = project.assets.find((item) => item.id === clip.assetId);
    const recordingId = recordingIdForProjectAsset(asset);
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
    const clips = instances.get(key) ?? [];
    const pointTime = (clip: VideoProjectVideoClip) =>
      clip.startTime +
      (anchor.sourceTime - clip.sourceStart) / (clip.playbackRate ?? 1) -
      (clip.playbackWindow?.offset ?? 0);
    const containsSource = (clip: VideoProjectVideoClip) =>
      anchor.sourceTime >= clip.sourceStart &&
      anchor.sourceTime < clip.sourceStart + clip.sourceDuration;
    const beforeHold = (clip: VideoProjectVideoClip) =>
      clip.playbackWindow?.holdAt === undefined ||
      (anchor.sourceTime - clip.sourceStart) / (clip.playbackRate ?? 1) <=
        clip.playbackWindow.holdAt + CONTINUITY_EPSILON;
    const containsDown = (clip: VideoProjectVideoClip) =>
      containsSource(clip) &&
      (!clip.playbackWindow ||
        (beforeHold(clip) &&
          pointTime(clip) >= clip.startTime - CONTINUITY_EPSILON &&
          pointTime(clip) < clip.startTime + clip.duration - CONTINUITY_EPSILON));
    const clipRuns = runs.get(key);
    const gesture = event.data['gestureType'];
    const down = event.data['downTime'];
    const ends = [
      event.data['upTime'],
      event.data['semanticEndTime'],
      event.data['lastObservedTime'],
    ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const observedEnd =
      event.kind === 'CLICK' &&
      typeof gesture === 'string' &&
      ['hold', 'drag', 'selection', 'native-drag'].includes(gesture) &&
      typeof down === 'number' &&
      Number.isFinite(down) &&
      down === anchor.sourceTime &&
      ends.length
        ? Math.max(...ends)
        : anchor.sourceTime;
    const anchoredRuns = new Set(
      clips.filter(containsDown).map((clip) => clipRuns?.get(clip.id)?.id ?? clip.id)
    );
    const continuations = new Map<string, VideoProjectVideoClip>();
    if (observedEnd > anchor.sourceTime || clips.some((clip) => clip.playbackWindow))
      for (const clip of clips) {
        const runId = clipRuns?.get(clip.id)?.id ?? clip.id;
        if (
          anchoredRuns.has(runId) ||
          anchor.sourceTime >= clip.sourceStart + clip.sourceDuration ||
          (clip.playbackWindow
            ? !(containsSource(clip) && beforeHold(clip) && pointTime(clip) < clip.startTime)
            : observedEnd <= clip.sourceStart)
        )
          continue;
        const previous = continuations.get(runId);
        if (
          !previous ||
          clip.startTime < previous.startTime ||
          (clip.startTime === previous.startTime && clip.id.localeCompare(previous.id) < 0)
        )
          continuations.set(runId, clip);
      }
    return clips.flatMap((clip) => {
      const runId = clipRuns?.get(clip.id)?.id ?? clip.id;
      if (!containsDown(clip) && continuations.get(runId)?.id !== clip.id) return [];
      return [
        {
          event,
          eventId: event.id,
          clipId: clip.id,
          time: pointTime(clip),
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
