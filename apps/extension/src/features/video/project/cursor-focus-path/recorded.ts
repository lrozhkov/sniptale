import { simplifyCursorFocusPath, finishCapturedCursorSegment } from './authoring';
import type { CursorFocusPath, CursorFocusSegment } from './types';
import type {
  RecordingActionEvent,
  RecordingTelemetrySignal,
  VideoProjectCursorTrack,
} from '../types';

export interface RecordedCursorFacts {
  cursorTrack: VideoProjectCursorTrack | null;
  actionEvents: readonly RecordingActionEvent[];
  signals: readonly RecordingTelemetrySignal[];
}

type RecordedFocusFacts = Omit<RecordedCursorFacts, 'actionEvents'> & {
  actionEvents: readonly Pick<
    RecordingActionEvent,
    'id' | 'kind' | 'time' | 'recordingPoint' | 'data'
  >[];
};

/** Source-time authoring adapter. Coverage markers cut the path; exact click/dwell anchors survive. */
export function deriveRecordedCursorFocusPath(
  facts: RecordedFocusFacts | null,
  source: { width: number; height: number; duration: number },
  observed = false,
  retainedKeyId?: string
): CursorFocusPath {
  const segments = deriveCapturedSegments(facts, source, observed);
  const anchors = deriveFocusAnchors(facts);
  appendFocusAnchors(segments, anchors, facts, observed);
  const path: CursorFocusPath = {
    version: 1,
    smoothing: 0.5,
    sensitivity: 0.5,
    mode: 'fixed',
    gapPolicy: 'hold',
    segments,
  };
  if (observed) {
    for (const segment of path.segments)
      for (const key of segment.keys) key.interpolation = 'linear';
  }
  return observed ? path : simplifyCursorFocusPath(path, retainedKeyId);
}

function deriveCapturedSegments(
  facts: RecordedFocusFacts | null,
  source: { width: number; height: number; duration: number },
  observed: boolean
): CursorFocusSegment[] {
  const segments: CursorFocusSegment[] = [];
  let active: CursorFocusSegment | undefined;
  let captureSegment: number | undefined;
  for (const sample of facts?.cursorTrack?.samples ?? []) {
    const point =
      sample.recordingPoint === undefined ||
      sample.recordingPoint === null ||
      !sample.visible ||
      (sample.observation && sample.observation !== 'observed')
        ? null
        : (sample.recordingPoint ?? { x: sample.x / source.width, y: sample.y / source.height });
    if (!point) {
      if (active) active.end = active.keys.at(-1)!.time;
      active = undefined;
      continue;
    }
    if (!active || captureSegment !== sample.captureSegment) {
      if (active) active.end = active.keys.at(-1)!.time;
      active = {
        id: `segment:${sample.id}`,
        binding: { kind: 'project' },
        start: sample.time,
        end: source.duration,
        keys: [],
      };
      segments.push(active);
      captureSegment = sample.captureSegment;
    }
    active.keys.push({
      id: sample.id,
      time: sample.time,
      ...point,
      anchor: active.keys.length ? 'movement' : 'boundary',
      interpolation: observed ? 'linear' : 'smooth',
    });
  }
  return segments;
}

function deriveFocusAnchors(facts: RecordedFocusFacts | null) {
  const anchors = [
    ...(facts?.actionEvents ?? []).flatMap((event) =>
      event.kind === 'CLICK' && event.recordingPoint
        ? [
            {
              id: `click:${event.id}`,
              time: event.time,
              ...event.recordingPoint,
              anchor: 'click' as const,
              interpolation: 'smooth' as const,
            },
            ...(event.data['completion'] === 'released' &&
            typeof event.data['upTime'] === 'number' &&
            typeof event.data['recordingUpX'] === 'number' &&
            typeof event.data['recordingUpY'] === 'number'
              ? [
                  {
                    id: `release:${event.id}`,
                    time: event.data['upTime'],
                    x: event.data['recordingUpX'],
                    y: event.data['recordingUpY'],
                    anchor: 'click' as const,
                    interpolation: 'smooth' as const,
                  },
                ]
              : []),
          ]
        : []
    ),
    ...(facts?.signals ?? []).flatMap((signal) =>
      signal.kind === 'cursor-idle' && signal.recordingPoint
        ? [
            {
              id: `dwell-start:${signal.id}`,
              time: signal.startTime,
              ...signal.recordingPoint,
              anchor: 'dwell' as const,
              interpolation: 'hold' as const,
            },
            {
              id: `dwell-end:${signal.id}`,
              time: signal.endTime,
              ...signal.recordingPoint,
              anchor: 'dwell' as const,
              interpolation: 'smooth' as const,
            },
          ]
        : []
    ),
  ];
  return anchors;
}

function appendFocusAnchors(
  segments: CursorFocusSegment[],
  anchors: CursorFocusSegment['keys'],
  facts: RecordedFocusFacts | null,
  observed: boolean
): void {
  for (const segment of segments) {
    if (!observed)
      segment.keys = segment.keys.filter(
        (key) =>
          key.anchor !== 'movement' ||
          !(facts?.signals ?? []).some(
            (signal) =>
              signal.kind === 'cursor-idle' &&
              signal.recordingPoint &&
              key.time > signal.startTime &&
              key.time < signal.endTime
          )
      );
    segment.keys.push(
      ...anchors.filter((key) => key.time >= segment.start && key.time <= segment.end)
    );
    finishCapturedCursorSegment(segment);
  }
}
