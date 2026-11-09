import type { RecordingActionEvent, RecordingTelemetrySignal } from './types';

const RECORDING_TYPING_MIN_SECONDS = 3;
const RECORDING_TYPING_FRAGMENT_MIN_SECONDS = 0.5;
export const RECORDING_TYPING_GAP_SECONDS = 1;

/** Orders captured facts without guessing which independent actions the user intended. */
export function normalizeRecordingActions(
  events: readonly RecordingActionEvent[]
): RecordingActionEvent[] {
  return events.toSorted((a, b) => a.time - b.time);
}

function isTextInput(signal: RecordingTelemetrySignal): boolean {
  return (
    signal.data['targetTag'] !== 'select' &&
    !['checkbox', 'radio', 'range', 'color', 'file', 'button'].includes(
      typeof signal.data['targetType'] === 'string' ? signal.data['targetType'] : ''
    )
  );
}

/** Discard tiny fragments before grouping; captureSegment prevents joining across recording pauses. */
export function deriveLongRecordingTypingSignals(
  signals: readonly RecordingTelemetrySignal[]
): RecordingTelemetrySignal[] {
  const result = signals.filter((signal) => signal.kind !== 'typing');
  let pending: RecordingTelemetrySignal | null = null;
  const flush = () => {
    if (pending && pending.endTime >= pending.startTime + RECORDING_TYPING_MIN_SECONDS)
      result.push(pending);
  };
  for (const signal of signals
    .filter(
      (item) =>
        item.kind === 'typing' &&
        item.data['activity'] !== 'keyboard' &&
        item.data['privacy'] !== 'protected' &&
        item.endTime >= item.startTime + RECORDING_TYPING_FRAGMENT_MIN_SECONDS &&
        isTextInput(item)
    )
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

/** Raw signals retain short input and anonymous keyboard rhythm; automatic long typing is derived. */
export function normalizeRecordingSignals(
  signals: readonly RecordingTelemetrySignal[]
): RecordingTelemetrySignal[] {
  return signals.toSorted((left, right) => left.startTime - right.startTime);
}
