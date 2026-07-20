import {
  RecordingTelemetrySignalKind,
  type RecordingTelemetrySignal,
} from '../../../features/video/project/types/interaction';

export type TimeRange = {
  endTime: number;
  startTime: number;
};

export function mergeTimeRanges(ranges: readonly TimeRange[], gapSeconds: number): TimeRange[] {
  const sortedRanges = [...ranges].sort((left, right) => left.startTime - right.startTime);
  const merged: TimeRange[] = [];

  for (const range of sortedRanges) {
    const previous = merged.at(-1);
    if (!previous || range.startTime > previous.endTime + gapSeconds) {
      merged.push({ ...range });
      continue;
    }

    previous.endTime = Math.max(previous.endTime, range.endTime);
  }

  return merged;
}

export function buildStableSignalIntersections(
  signals: readonly RecordingTelemetrySignal[],
  applyShoulder: (range: TimeRange) => TimeRange = (range) => range
): TimeRange[] {
  const idleSignals = signals.filter(
    (signal) => signal.kind === RecordingTelemetrySignalKind.CURSOR_IDLE
  );
  const staticSignals = signals.filter(
    (signal) => signal.kind === RecordingTelemetrySignalKind.STATIC_FRAME
  );
  const ranges: TimeRange[] = [];

  for (const idleSignal of idleSignals) {
    for (const staticSignal of staticSignals) {
      const startTime = Math.max(idleSignal.startTime, staticSignal.startTime);
      const endTime = Math.min(idleSignal.endTime, staticSignal.endTime);
      if (endTime > startTime) {
        ranges.push(applyShoulder({ startTime, endTime }));
      }
    }
  }

  return ranges;
}
