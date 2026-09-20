import type { RecordingActionEvent, RecordingTelemetrySignal } from './types';

export const RECORDING_TYPING_MIN_SECONDS = 3;
export const RECORDING_TYPING_GAP_SECONDS = 1;
const RECORDING_CLICK_GAP_SECONDS = 0.5;

/** Capture facts only: authored project actions are never removed by this policy. */
export function normalizeRecordingActions(
  events: readonly RecordingActionEvent[]
): RecordingActionEvent[] {
  const result: RecordingActionEvent[] = [];
  for (const event of [...events].sort((a, b) => a.time - b.time)) {
    const previous = result.at(-1);
    if (previous && isRepeatedRecordingClick(previous, event)) {
      if (event.data['clickCount'] === 2)
        result[result.length - 1] = { ...previous, data: { ...previous.data, clickCount: 2 } };
      continue;
    }
    result.push(event);
  }
  return result;
}

/** Unknown target identity is preserved rather than guessed from a position or label. */
export function isRepeatedRecordingClick(
  previous: RecordingActionEvent,
  event: RecordingActionEvent
): boolean {
  const target = event.data['targetId'];
  return (
    previous.kind === 'CLICK' &&
    event.kind === 'CLICK' &&
    event.time >= previous.time &&
    event.time < previous.time + RECORDING_CLICK_GAP_SECONDS &&
    typeof target === 'string' &&
    target.length > 0 &&
    previous.data['targetId'] === target &&
    previous.data['button'] === event.data['button']
  );
}

function isTextInput(signal: RecordingTelemetrySignal): boolean {
  return (
    signal.data['targetTag'] !== 'select' &&
    !['checkbox', 'radio', 'range', 'color', 'file', 'button'].includes(
      typeof signal.data['targetType'] === 'string' ? signal.data['targetType'] : ''
    )
  );
}

/** Merge before filtering; captureSegment prevents joining across recording pauses. */
export function normalizeRecordingSignals(
  signals: readonly RecordingTelemetrySignal[]
): RecordingTelemetrySignal[] {
  const result = signals.filter((signal) => signal.kind !== 'typing');
  let pending: RecordingTelemetrySignal | null = null;
  const flush = () => {
    if (pending && pending.endTime >= pending.startTime + RECORDING_TYPING_MIN_SECONDS)
      result.push(pending);
  };
  for (const signal of signals
    .filter((item) => item.kind === 'typing' && isTextInput(item))
    .sort((a, b) => a.startTime - b.startTime)) {
    if (
      pending &&
      signal.startTime < pending.endTime + RECORDING_TYPING_GAP_SECONDS &&
      signal.data['captureSegment'] === pending.data['captureSegment']
    ) {
      pending = mergeTypingSignals(pending, signal);
    } else {
      flush();
      pending = signal;
    }
  }
  flush();
  return result.sort((a, b) => a.startTime - b.startTime);
}

function mergeTypingSignals(
  previous: RecordingTelemetrySignal,
  next: RecordingTelemetrySignal
): RecordingTelemetrySignal {
  const count = previous.data['eventCount'];
  const nextCount = next.data['eventCount'];
  return {
    ...previous,
    endTime: Math.max(previous.endTime, next.endTime),
    data: {
      ...previous.data,
      ...(typeof count === 'number' && typeof nextCount === 'number'
        ? { eventCount: count + nextCount }
        : {}),
    },
  };
}
