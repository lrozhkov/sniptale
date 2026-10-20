import { getVideoProjectClickStyle } from '../../../../features/video/project/action-feedback/projection';
import { REVIEW_CLICK_BOUNDS } from '../../../../features/video/project/action-feedback/validation';
import type { ResolvedVideoProjectActionPresentation } from '../../../../features/video/project/action-presentation';
import type {
  VideoProjectActionEvent,
  VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { mapSourceRangeToProjectSpans } from '../../../../features/video/project/timeline/source-time';
import {
  projectTimelineInterval,
  projectTimelinePoint,
  type TimelineProjection,
} from '../interaction-state/projection';
import { clusterHistoryIntervals } from './history-clusters';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { VideoProject } from '../../../../features/video/project/types';

export const TIMELINE_CURSOR_ROW_HEIGHT = 24;

/** One row geometry shared by the history rail, canvas, playhead and drop coordinates. */
export function getTimelineHistoryLayout(
  _project: VideoProject,
  _telemetry: readonly RecordingTelemetryEntry[] = [],
  _cursorVisible = false
) {
  return {
    keyTop: 0,
    typingTop: 0,
    clickTop: 28,
    actionHeight: 56,
    cursorTop: 56,
    height: 56 + TIMELINE_CURSOR_ROW_HEIGHT,
  };
}

export function historyTimeBounds(
  item: ResolvedVideoProjectActionPresentation,
  project: VideoProject
) {
  const ids = item.occurrence.playbackRun?.clipIds;
  const clips = ids ? project.clips.filter((clip) => ids.includes(clip.id)) : [];
  const minimumTime = clips.length ? Math.min(...clips.map((clip) => clip.startTime)) : 0;
  const end = clips.length
    ? Math.max(...clips.map((clip) => clip.startTime + clip.duration))
    : project.duration;
  const maximumTime = Math.max(minimumTime, end - 1 / project.fps);
  const style = getVideoProjectClickStyle(project, item.event);
  if (!style) return { minimumTime, maximumTime };
  const current = Math.max(minimumTime, Math.min(maximumTime, item.animationStart));
  return {
    minimumTime: Math.max(minimumTime, current + REVIEW_CLICK_BOUNDS.offset[0] - style.offset),
    maximumTime: Math.min(maximumTime, current + REVIEW_CLICK_BOUNDS.offset[1] - style.offset),
  };
}

export function historyMarkerTime(
  item: ResolvedVideoProjectActionPresentation,
  project: VideoProject
) {
  const observed = recordedHistoryRange(item, project);
  if (observed) return observed.start;
  const { minimumTime, maximumTime } = historyTimeBounds(item, project);
  return Math.max(
    minimumTime,
    Math.min(
      maximumTime,
      observedKeyboardInterval(item.event) ? item.occurrence.time : item.animationStart
    )
  );
}

export function observedKeyboardInterval(event: VideoProjectActionEvent) {
  const start = event.kind === 'KEY' ? event.data['keyboardOnsetTime'] : undefined;
  if (typeof start !== 'number' || !Number.isFinite(start) || start < 0) return null;
  const ends = [event.data['upTime'], event.data['lastObservedTime']].filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= start
  );
  return { start, end: Math.max(start, ...ends) };
}

function recordedHistoryDuration(
  item: ResolvedVideoProjectActionPresentation,
  project: VideoProject
) {
  const range = recordedHistoryRange(item, project);
  return range ? range.end - range.start : 0;
}

/** Source ranges remain factual when the down point is trimmed or playback rates change. */
function recordedHistoryRange(item: ResolvedVideoProjectActionPresentation, project: VideoProject) {
  const data = item.event.data;
  const down = data['downTime'];
  const ends = [data['upTime'], data['semanticEndTime'], data['lastObservedTime']].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  const up = ends.length ? Math.max(...ends) : undefined;
  const gesture = data['gestureType'];
  const keyboard = observedKeyboardInterval(item.event);
  const duration = keyboard
    ? keyboard.end - keyboard.start
    : typeof gesture === 'string' &&
        (['hold', 'drag', 'selection', 'native-drag'].includes(gesture) ||
          isIncompleteObservedPress(item.event)) &&
        typeof down === 'number' &&
        typeof up === 'number' &&
        up >= down
      ? up - down
      : item.event.kind === 'SCROLL'
        ? (item.event.capturedDuration ?? 0)
        : 0;
  if (duration <= 0 || !Number.isFinite(duration)) return null;
  const anchor = item.event.anchor;
  if (anchor.kind === 'project') {
    const start = Math.max(0, item.occurrence.time);
    const end = Math.min(project.duration, item.occurrence.time + duration);
    return end > start ? { start, end } : null;
  }
  const clipIds = item.occurrence.playbackRun?.clipIds ?? [item.occurrence.clipId];
  const clips = project.clips.filter(
    (clip): clip is VideoProjectVideoClip => clip.type === 'VIDEO' && clipIds.includes(clip.id)
  );
  const intervals = mapSourceRangeToProjectSpans(
    clips,
    anchor.sourceTime,
    anchor.sourceTime + duration
  );
  if (!intervals.length) return null;
  return { start: intervals[0]!.startTime, end: intervals.at(-1)!.endTime };
}

export function isIncompleteObservedPress(event: VideoProjectActionEvent) {
  const gesture = event.data['gestureType'];
  const completion = event.data['completion'];
  return (
    typeof gesture === 'string' &&
    ['click', 'hold', 'drag', 'selection', 'native-drag'].includes(gesture) &&
    typeof completion === 'string' &&
    completion !== 'released' &&
    (gesture === 'click' || completion !== 'semantic')
  );
}

export function buildHistoryTargetGroups({
  items,
  spans,
  project,
  projection,
  pixelsPerSecond,
  draft,
  layout,
}: {
  items: readonly ResolvedVideoProjectActionPresentation[];
  spans: readonly { id: string; startTime: number; endTime: number }[];
  project: VideoProject;
  projection: TimelineProjection | undefined;
  pixelsPerSecond: number;
  draft: { segmentId?: string; startTime?: number } | null;
  layout: ReturnType<typeof getTimelineHistoryLayout>;
}) {
  const actionLeft = new Map<string, number>();
  const actionWidths = new Map<string, number>();
  const groups = [false, true].flatMap((keys) => {
    const targets = items
      .filter((item) => (item.event.kind === 'KEY') === keys)
      .map((item) => {
        const id = JSON.stringify([item.occurrence.eventId, item.occurrence.clipId]);
        const time =
          draft?.segmentId === id
            ? (draft.startTime ?? historyMarkerTime(item, project))
            : historyMarkerTime(item, project);
        const duration = recordedHistoryDuration(item, project);
        const interval =
          duration > 0 && projection
            ? projectTimelineInterval(projection, time, time + duration)
            : null;
        const point = projection ? projectTimelinePoint(projection, time) : time * pixelsPerSecond;
        if (
          !interval &&
          projection &&
          point !== null &&
          (point < 0 || point > projection.viewportWidth)
        )
          return { id, left: null, width: 0 };
        const visible = interval ? interval.left + 12 : point;
        if (visible === null) return { id, left: null, width: 0 };
        const floor = duration > 0 ? 12 : 20;
        const anchor = projection
          ? Math.max(floor, Math.min(projection.viewportWidth - floor, visible))
          : visible;
        actionLeft.set(id, anchor);
        const width =
          duration > 0 ? Math.max(24, interval?.width ?? duration * pixelsPerSecond) : 0;
        if (width)
          actionWidths.set(
            id,
            projection ? Math.min(width, projection.viewportWidth - anchor + 12) : width
          );
        return { id, left: anchor - floor, width: duration > 0 ? width : 40 };
      });
    const grouped = clusterHistoryIntervals(targets, projection?.viewportWidth);
    for (let index = 0; index < grouped.length; index++) {
      const group = grouped[index]!;
      const id = group.ids[0]!;
      if (group.ids.length !== 1 || actionWidths.has(id)) continue;
      const anchor = actionLeft.get(id)!;
      const end = grouped[index + 1]
        ? grouped[index + 1]!.left + (grouped[index + 1]!.ids.length === 1 ? 8 : 0)
        : (projection?.viewportWidth ?? project.duration * pixelsPerSecond);
      actionWidths.set(id, Math.min(120, Math.max(24, end - anchor + 8)));
    }
    const typing = keys
      ? spans.map((span) => {
          const geometry = projection
            ? projectTimelineInterval(projection, span.startTime, span.endTime)
            : {
                left: span.startTime * pixelsPerSecond,
                width: (span.endTime - span.startTime) * pixelsPerSecond,
              };
          return { id: span.id, left: geometry?.left ?? null, width: geometry?.width ?? 0 };
        })
      : [];
    return exposeTypingTargets(
      grouped,
      clusterHistoryIntervals(typing, projection?.viewportWidth),
      actionLeft,
      actionWidths
    ).map((group) => ({
      ...group,
      left: projection
        ? Math.max(20, Math.min(projection.viewportWidth - 20, group.left + 20))
        : group.left + 20,
      top: keys ? layout.keyTop : layout.clickTop,
    }));
  });
  return { actionLeft, actionWidths, groups };
}

/** A fully covered typing target shares the covering chooser so all facts remain selectable. */
function exposeTypingTargets(
  actions: ReturnType<typeof clusterHistoryIntervals>,
  typing: ReturnType<typeof clusterHistoryIntervals>,
  actionLeft: Map<string, number>,
  actionWidths: Map<string, number>
) {
  const groups = [...actions];
  const visibleTyping: typeof typing = [];
  for (const span of typing) {
    const end = span.left + Math.max(span.ids.length > 1 ? 40 : 16, span.width);
    const covering = groups
      .map((group) => {
        const id = group.ids[0]!;
        const left = group.ids.length === 1 ? actionLeft.get(id)! - 12 : group.left;
        const width = group.ids.length === 1 ? (actionWidths.get(id) ?? 24) : 40;
        return { group, left, end: left + width };
      })
      .filter((rect) => rect.left < end && rect.end > span.left)
      .sort((a, b) => a.left - b.left);
    let right = span.left;
    let gap = 0;
    for (const rect of covering) {
      gap = Math.max(gap, rect.left - right);
      right = Math.max(right, rect.end);
    }
    gap = Math.max(gap, end - right);
    if (!covering.length || gap >= Math.min(24, end - span.left)) {
      visibleTyping.push(span);
      continue;
    }
    const target = covering[0]!.group;
    target.ids.push(...span.ids);
    for (const { group } of covering.slice(1)) {
      target.ids.push(...group.ids);
      groups.splice(groups.indexOf(group), 1);
    }
  }
  return [...groups, ...visibleTyping];
}
