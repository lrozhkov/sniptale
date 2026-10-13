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
  return { minimumTime, maximumTime: Math.max(minimumTime, end - 1 / project.fps) };
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
    if (keys)
      for (const span of spans) {
        const geometry = projection
          ? projectTimelineInterval(projection, span.startTime, span.endTime)
          : {
              left: span.startTime * pixelsPerSecond,
              width: (span.endTime - span.startTime) * pixelsPerSecond,
            };
        targets.push({ id: span.id, left: geometry?.left ?? null, width: geometry?.width ?? 0 });
      }
    return clusterHistoryIntervals(targets, projection?.viewportWidth).map((group) => ({
      ...group,
      left: projection
        ? Math.max(20, Math.min(projection.viewportWidth - 20, group.left + 20))
        : group.left + 20,
      top: keys ? layout.keyTop : layout.clickTop,
    }));
  });
  return { actionLeft, actionWidths, groups };
}
