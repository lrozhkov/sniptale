import type { RecordingActionEvent } from '../project/types';

const SCROLL_HISTORY_GAP_SECONDS = 0.5;
const SCROLL_CONTEXT_KEYS = ['captureSegment', 'observationClockId', 'targetId'] as const;
const WHEEL_CONTEXT_KEYS = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey', 'deltaMode'] as const;

/** Presentation-only ranges from time-sorted capture facts; never write these back to telemetry. */
export function groupHistoryScrollActions(
  actions: readonly RecordingActionEvent[]
): RecordingActionEvent[] {
  const ranges: RecordingActionEvent[] = [];
  const pending = new Map<string, { index: number; lastTime: number }>();
  let previous: RecordingActionEvent | undefined;
  for (const action of actions) {
    if (
      action.kind !== 'SCROLL' ||
      !Number.isFinite(action.time) ||
      action.time < 0 ||
      !Number.isFinite(action.duration) ||
      action.duration < 0 ||
      !Number.isFinite(action.time + action.duration)
    ) {
      pending.clear();
      previous = undefined;
      ranges.push(action);
      continue;
    }
    if (previous && !sameScrollContext(previous, action, SCROLL_CONTEXT_KEYS)) pending.clear();
    const family = action.data['eventType'] === 'wheel' ? 'wheel' : 'scroll';
    const active = pending.get(family);
    const range = active && ranges[active.index];
    if (
      active &&
      range &&
      action.time >= active.lastTime &&
      action.time - active.lastTime <= SCROLL_HISTORY_GAP_SECONDS &&
      range.data['eventType'] === action.data['eventType'] &&
      (family !== 'wheel' || sameScrollContext(range, action, WHEEL_CONTEXT_KEYS))
    ) {
      ranges[active.index] = {
        ...range,
        duration: Math.max(range.time + range.duration, action.time + action.duration) - range.time,
      };
      active.lastTime = action.time;
    } else {
      pending.set(family, { index: ranges.length, lastTime: action.time });
      ranges.push(action);
    }
    previous = action;
  }
  return ranges;
}

function sameScrollContext(
  left: RecordingActionEvent,
  right: RecordingActionEvent,
  keys: readonly string[]
): boolean {
  return keys.every((key) => left.data[key] === right.data[key]);
}
