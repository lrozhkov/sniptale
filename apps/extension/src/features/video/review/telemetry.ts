import { normalizeRecordingActions, normalizeRecordingSignals } from '../project/recording-actions';
import type {
  RecordingTelemetrySignal,
  RecordingActionEvent,
  VideoProjectCursorTrack,
} from '../project/types';

interface ReviewTelemetryInput {
  actionEvents: readonly RecordingActionEvent[];
  signals: readonly RecordingTelemetrySignal[];
  cursorTrack: VideoProjectCursorTrack | null;
}

export interface ReviewTelemetryMarker {
  ref: { kind: 'action' | 'signal' | 'cursor'; id: string };
  eventType: string;
  target?: string;
  start: number;
  end: number;
}

/** Projects recorded interactions only; backend warnings never become fabricated timeline events. */
export function projectReviewTelemetry(
  input: ReviewTelemetryInput,
  duration: number,
  includeCursor = false
) {
  const markers: ReviewTelemetryMarker[] = [];
  let warnings = 0;
  const add = (
    kind: ReviewTelemetryMarker['ref']['kind'],
    id: string,
    eventType: string,
    start: number,
    end: number,
    target?: string
  ) => {
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      start > duration ||
      end < start
    )
      return;
    markers.push({
      ref: { kind, id },
      eventType,
      start,
      end: Math.min(duration, end),
      ...(target ? { target: target.slice(0, 120) } : {}),
    });
  };
  for (const event of normalizeRecordingActions(input.actionEvents))
    add(
      'action',
      event.id,
      event.kind === 'CLICK' && event.data['clickCount'] === 2 ? 'DOUBLE_CLICK' : event.kind,
      event.time,
      event.time + event.duration,
      event.label || undefined
    );
  for (const signal of normalizeRecordingSignals(input.signals)) {
    if (signal.kind === 'static-frame' && signal.startTime === signal.endTime) {
      if (signal.data['code'] !== undefined) warnings += 1;
      continue;
    }
    const target = signal.data['targetName'];
    add(
      'signal',
      signal.id,
      signal.kind,
      signal.startTime,
      signal.endTime,
      typeof target === 'string' ? target : undefined
    );
  }
  if (includeCursor)
    for (const sample of input.cursorTrack?.samples ?? [])
      if (sample.visible) add('cursor', sample.id, 'cursor', sample.time, sample.time);
  markers.sort((a, b) => a.start - b.start || a.ref.id.localeCompare(b.ref.id));
  return { markers, warnings };
}
