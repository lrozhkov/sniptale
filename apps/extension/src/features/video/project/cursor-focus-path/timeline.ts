import type { VideoProject } from '../types';
import type { CursorFocusBinding, CursorFocusKey, CursorFocusPath } from './types';
import { resolveProjectCursorFocusPath } from './projection';

/** A disposable occurrence of one source key on the editor's existing time axis. */
export interface CursorFocusTimelineKey extends CursorFocusKey {
  timelineId: string;
  segmentId: string;
  binding: CursorFocusBinding;
  sourceTime: number;
  sourceClipId?: string;
}

export function reviewCursorFocusTimelineKeys(path: CursorFocusPath): CursorFocusTimelineKey[] {
  return path.segments
    .flatMap((segment) =>
      segment.keys.map((key) => ({
        ...key,
        timelineId: `${segment.id}:${key.id}`,
        segmentId: segment.id,
        binding: segment.binding,
        sourceTime: key.time,
      }))
    )
    .sort(compareTimelineKeys);
}

/** Source keys project through retained clip instances; the durable source timestamp is unchanged. */
export function projectCursorFocusTimelineKeys(project: VideoProject): CursorFocusTimelineKey[] {
  const keys = resolveProjectCursorFocusPath(project)
    .segments.flatMap((segment) => {
      if (segment.binding.kind === 'project')
        return segment.keys.map((key) => ({
          ...key,
          timelineId: `${segment.id}:${key.id}`,
          segmentId: segment.id,
          binding: segment.binding,
          sourceTime: key.time,
        }));
      const binding = segment.binding;
      return project.clips.flatMap((clip) =>
        clip.type === 'VIDEO' && (clip.sourceInstanceId ?? clip.id) === binding.sourceInstanceId
          ? segment.keys
              .filter(
                (key) =>
                  key.time >= clip.sourceStart && key.time <= clip.sourceStart + clip.sourceDuration
              )
              .map((key) => ({
                ...key,
                timelineId: `${clip.id}:${key.id}`,
                segmentId: segment.id,
                binding,
                sourceTime: key.time,
                time: clip.startTime + (key.time - clip.sourceStart) / (clip.playbackRate ?? 1),
                sourceClipId: clip.id,
              }))
          : []
      );
    })
    .sort(compareTimelineKeys);
  // A split boundary is one occurrence on a continuous output axis, not two independent facts.
  return keys.filter(
    (key, index) =>
      index === 0 || key.id !== keys[index - 1]!.id || key.time !== keys[index - 1]!.time
  );
}

function compareTimelineKeys(a: CursorFocusTimelineKey, b: CursorFocusTimelineKey) {
  return a.time - b.time || a.timelineId.localeCompare(b.timelineId);
}

/** Bounded point groups retain every simplified/mandatory key, including coincident keys. */
export function layoutCursorFocusKeyGroups(
  keys: readonly CursorFocusTimelineKey[],
  pixelsPerSecond: number
) {
  const groups: { left: number; members: CursorFocusTimelineKey[] }[] = [];
  for (const key of keys.toSorted(compareTimelineKeys)) {
    const previous = groups.at(-1);
    if (previous && (key.time - previous.members[0]!.time) * pixelsPerSecond < 24) {
      previous.members.push(key);
      previous.left = ((previous.members[0]!.time + key.time) * pixelsPerSecond) / 2;
    } else groups.push({ left: key.time * pixelsPerSecond, members: [key] });
  }
  return groups;
}

/** Navigation uses the same occurrence list and selected source identity as row/canvas/inspector. */
export function adjacentCursorFocusKey(
  keys: readonly CursorFocusTimelineKey[],
  selectedId: string | undefined,
  time: number,
  direction: -1 | 1
) {
  const ordered = keys.toSorted(compareTimelineKeys);
  const selected = ordered
    .map((key, index) => ({ key, index }))
    .filter(({ key }) => key.id === selectedId)
    .sort((a, b) => Math.abs(a.key.time - time) - Math.abs(b.key.time - time))[0];
  if (selected) return ordered[selected.index + direction] ?? null;
  return direction === 1
    ? (ordered.find((key) => key.time > time) ?? null)
    : (ordered.findLast((key) => key.time < time) ?? null);
}
