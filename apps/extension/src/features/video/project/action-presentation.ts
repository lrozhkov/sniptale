import {
  getVideoProjectClickStyle,
  getVideoProjectFeedbackRuns,
} from './action-feedback/projection';
import { REVIEW_CLICK_DEFAULT } from './action-feedback/validation';
import type { ReviewClickStyle } from './action-feedback/types';
import { reviewCueWindow } from '../review/cue-window';
import { getActionClickStyle, getActionKeyStyle } from './action-style';
import {
  resolveVideoProjectActionOccurrences,
  type VideoProjectActionOccurrence,
} from './action-occurrences';
import type {
  VideoProject,
  VideoProjectActionEvent,
  VideoProjectActionPoint,
  VideoProjectActionPresentation,
  VideoProjectActionPreset,
} from './types';

export type VideoProjectActionPresentationReason =
  | 'track-disabled'
  | 'event-disabled'
  | 'suppressed'
  | 'preset-none'
  | 'keystrokes-disabled'
  | 'unsupported'
  | 'outside-source';

export interface ResolvedVideoProjectActionPresentation {
  clickStyle: ReturnType<typeof getActionClickStyle>;
  keyStyle: ReturnType<typeof getActionKeyStyle>;
  easing: import('./types').VideoTemporalEasing;
  event: VideoProjectActionEvent;
  preset: VideoProjectActionPreset;
  duration: number;
  offset: number;
  point: VideoProjectActionPoint | null;
  enabled: boolean;
  reason: VideoProjectActionPresentationReason | null;
  occurrence: VideoProjectActionOccurrence;
  pointSpace: 'source-normalized' | 'scene';
  renderIntervals: { clipId: string | null; start: number; end: number }[];
  suppressedByOccurrence: { eventId: string; clipId: string | null } | null;
  overridden: boolean;
  renderKind: 'accent' | 'keystroke' | null;
  start: number;
  end: number;
  animationStart: number;
}

/** Returns authored settings or the standard defaults without mutating the project. */
export function getVideoProjectActionPresentation(
  project: Pick<VideoProject, 'actionPresentation'>
): VideoProjectActionPresentation {
  return project.actionPresentation
    ? { ...project.actionPresentation }
    : {
        enabled: true,
        clickPreset: 'CLICK_RIPPLE',
        duration: 0.7,
        offset: 0,
        clickSuppressionInterval: 1,
        showKeystrokes: false,
      };
}

/** Resolves every history event, retaining disabled rows and immutable event identity. */
export function resolveVideoProjectActionPresentations(
  project: VideoProject
): ResolvedVideoProjectActionPresentation[] {
  const defaults = getVideoProjectActionPresentation(project);
  const leaders = new Map<string, VideoProjectActionOccurrence>();
  return resolveVideoProjectActionOccurrences(project).map((occurrence) => {
    const row = resolveEvent(project, defaults, occurrence);
    const event = occurrence.event;
    if (
      row.enabled &&
      getVideoProjectClickStyle(project, event) === null &&
      event.kind === 'CLICK' &&
      !(
        typeof event.data['gestureType'] === 'string' &&
        ['hold', 'drag', 'selection', 'native-drag'].includes(event.data['gestureType'])
      )
    ) {
      const key = occurrence.playbackRun?.id ?? 'project';
      const leader = leaders.get(key);
      if (
        leader &&
        occurrence.time - leader.time < defaults.clickSuppressionInterval &&
        event.presentation?.enabled !== true
      ) {
        return {
          ...row,
          enabled: false,
          reason: 'suppressed' as const,
          suppressedByOccurrence: { eventId: leader.eventId, clipId: leader.clipId },
          renderKind: null,
        };
      }
      if (!leader || occurrence.time - leader.time >= defaults.clickSuppressionInterval)
        leaders.set(key, occurrence);
    }
    return row;
  });
}

function resolveEvent(
  project: VideoProject,
  defaults: VideoProjectActionPresentation,
  occurrence: VideoProjectActionOccurrence
): ResolvedVideoProjectActionPresentation {
  const event = occurrence.event;
  const sourceClick = getVideoProjectClickStyle(project, event);
  if (sourceClick) return resolveSourceClick(project, defaults, occurrence, sourceClick);
  const override = event.presentation;
  const preset = override?.preset ?? (event.kind === 'CLICK' ? defaults.clickPreset : 'NONE');
  const duration = override?.duration ?? defaults.duration;
  const offset = override?.offset ?? defaults.offset;
  const animationStart = occurrence.time + offset;
  const intervals = occurrence.playbackRun
    ? occurrence.playbackRun.clipIds.flatMap((clipId) => {
        const clip = project.clips.find((item) => item.id === clipId);
        return clip ? [{ clipId, start: clip.startTime, end: clip.startTime + clip.duration }] : [];
      })
    : [{ clipId: null, start: 0, end: project.duration }];
  const renderIntervals = intervals
    .map((interval) => ({
      clipId: interval.clipId,
      start: Math.max(0, animationStart, interval.start),
      end: Math.min(project.duration, animationStart + duration, interval.end),
    }))
    .filter((interval) => interval.end > interval.start);
  const start = renderIntervals[0]?.start ?? Math.max(0, animationStart);
  const end = renderIntervals.at(-1)?.end ?? start;
  const reason = resolveReason(event, defaults, preset, renderIntervals.length > 0);
  return {
    event,
    occurrence,
    clickStyle: getActionClickStyle(override?.clickStyle ?? defaults.clickStyle),
    keyStyle: getActionKeyStyle(override?.keyStyle ?? defaults.keyStyle),
    easing: override?.easing ?? defaults.easing ?? 'EASE_OUT',
    preset,
    duration,
    offset,
    point: override?.point ?? event.point,
    pointSpace: event.anchor.kind === 'recording-source' ? 'source-normalized' : 'scene',
    enabled: reason === null,
    reason,
    suppressedByOccurrence: null,
    overridden: !!override && Object.keys(override).length > 0,
    renderKind: reason ? null : event.kind === 'KEY' ? 'keystroke' : 'accent',
    renderIntervals,
    start,
    end,
    animationStart,
  };
}

const SOURCE_CLICK_PRESETS = {
  off: 'NONE',
  ripple: 'CLICK_RIPPLE',
  press: 'CLICK_PRESS',
  glow: 'SPOTLIGHT',
  magnify: 'DWELL_ZOOM',
} as const;
const SOURCE_CLICK_EASING = {
  linear: 'LINEAR',
  'ease-out': 'EASE_OUT',
  'ease-in-out': 'EASE_IN_OUT',
} as const;

function resolveSourceClick(
  project: VideoProject,
  defaults: VideoProjectActionPresentation,
  occurrence: VideoProjectActionOccurrence,
  style: Readonly<ReviewClickStyle>
): ResolvedVideoProjectActionPresentation {
  const event = occurrence.event,
    anchor = event.anchor;
  const run =
    anchor.kind === 'recording-source'
      ? getVideoProjectFeedbackRuns(project, anchor).find((item) =>
          item.clips.some((clip) => clip.id === occurrence.clipId)
        )
      : undefined;
  const clips = run?.clips ?? [];
  const window =
    anchor.kind === 'recording-source' && run
      ? reviewCueWindow(run.segments, anchor.sourceTime, style.offset, style.before, style.after)
      : null;
  const feedbackOccurrence = run
    ? {
        ...occurrence,
        playbackRun: { id: run.clips[0]!.id, clipIds: clips.map((clip) => clip.id) },
      }
    : occurrence;
  const animationStart = (window?.anchor ?? occurrence.time + style.offset) - style.before;
  const renderIntervals = window
    ? clips
        .map((clip) => ({
          clipId: clip.id,
          start: Math.max(clip.startTime, window.start),
          end: Math.min(clip.startTime + clip.duration, window.end),
        }))
        .filter((interval) => interval.end > interval.start)
    : [];
  const reason = resolveSourceClickReason(event, defaults, style, renderIntervals.length > 0);
  const start = renderIntervals[0]?.start ?? Math.max(0, animationStart);
  return {
    event,
    occurrence: feedbackOccurrence,
    duration: style.before + style.after,
    offset: style.offset,
    clickStyle: {
      color: style.color,
      size: style.radius,
      strokeWidth: style.stroke,
      opacity: style.opacity,
    },
    keyStyle: getActionKeyStyle(defaults.keyStyle),
    easing: SOURCE_CLICK_EASING[style.easing],
    preset: SOURCE_CLICK_PRESETS[style.effect],
    pointSpace: 'source-normalized',
    point: event.point ? { x: event.point.x + style.x, y: event.point.y + style.y } : null,
    enabled: reason === null,
    reason,
    renderKind: reason ? null : 'accent',
    renderIntervals,
    suppressedByOccurrence: null,
    overridden: style !== REVIEW_CLICK_DEFAULT || event.presentation?.enabled !== undefined,
    start,
    end: renderIntervals.at(-1)?.end ?? start,
    animationStart,
  };
}

function resolveSourceClickReason(
  event: VideoProjectActionEvent,
  defaults: VideoProjectActionPresentation,
  style: Readonly<ReviewClickStyle>,
  hasInterval: boolean
): VideoProjectActionPresentationReason | null {
  if (!defaults.enabled) return 'track-disabled';
  if (event.presentation?.enabled === false) return 'event-disabled';
  if (style.effect === 'off') return 'preset-none';
  if (!event.point) return 'unsupported';
  return hasInterval ? null : 'outside-source';
}

function resolveReason(
  event: VideoProjectActionEvent,
  defaults: VideoProjectActionPresentation,
  preset: VideoProjectActionPreset,
  hasInterval: boolean
): VideoProjectActionPresentationReason | null {
  if (!defaults.enabled) return 'track-disabled';
  if (event.presentation?.enabled === false) return 'event-disabled';
  if (
    event.kind === 'CLICK' &&
    event.data['gestureType'] === 'click' &&
    event.data['completion'] !== 'released'
  )
    return 'unsupported';
  if (event.kind === 'SCROLL' || preset === 'SCROLL_EMPHASIS') return 'unsupported';
  if (event.kind === 'KEY') {
    if (event.presentation?.preset === 'NONE') return 'preset-none';
    if (!defaults.showKeystrokes && event.presentation?.enabled !== true)
      return 'keystrokes-disabled';
  } else if (preset === 'NONE') return 'preset-none';
  return hasInterval ? null : 'outside-source';
}

/** Assigns the event kind used when a user chooses an action preset. */
export function resolveActionKindForPreset(
  preset: VideoProjectActionPreset
): VideoProjectActionEvent['kind'] {
  switch (preset) {
    case 'SCROLL_EMPHASIS':
      return 'SCROLL';
    case 'DWELL_ZOOM':
      return 'PAUSE';
    case 'SPOTLIGHT':
      return 'CALLOUT';
    case 'NONE':
    case 'CLICK_PRESS':
    case 'CLICK_RIPPLE':
      return 'CLICK';
  }
}
