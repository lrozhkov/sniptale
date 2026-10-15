import type {
  RecordingActionEvent,
  RecordingKeyboardRhythmBlock,
  RecordingObservationClock,
  RecordingObservationClockSegment,
  RecordingTelemetrySignal,
  VideoProjectCursorTrack,
} from './types';
import { encodeRecordingKeyboardRhythm, iterateRecordingKeyboardRhythm } from './keyboard-rhythm';

type Observations = {
  observationClock?: RecordingObservationClock;
  cursorTrack: VideoProjectCursorTrack | null;
  actionEvents: RecordingActionEvent[];
  signals: RecordingTelemetrySignal[];
};

function offset(segment: RecordingObservationClockSegment): number {
  const mapping = segment.mapping;
  const start = mapping
    ? mapping.mediaTimeSeconds +
      (segment.timeOriginMs + segment.startedAtTimestampMs - mapping.captureEpochMs) / 1000
    : segment.mediaStartEstimateSeconds;
  return start - segment.observationStartSeconds;
}

function mapData(data: RecordingActionEvent['data'], shift: number) {
  const result = { ...data };
  for (const key of [
    'downTime',
    'upTime',
    'lastObservedTime',
    'semanticEndTime',
    'dragStartTime',
    'keyboardOnsetTime',
  ]) {
    const value = result[key];
    if (typeof value === 'number') result[key] = value + shift;
  }
  return result;
}

function rhythm(blocks: RecordingKeyboardRhythmBlock[] | undefined, shift: number, end: number) {
  return blocks?.flatMap((block) => {
    const times = [...iterateRecordingKeyboardRhythm(block)]
      .map((attack) => attack.time + shift)
      .filter((time) => time >= 0 && time <= end);
    return times.length ? [encodeRecordingKeyboardRhythm(block.id, times)] : [];
  });
}

function projectAction(event: RecordingActionEvent, segment: RecordingObservationClockSegment) {
  const shift = offset(segment);
  const end = Math.min(86400, segment.mediaEndSeconds ?? 86400);
  const time = event.time + shift;
  if (time < 0 || time > end) return [];
  const data = mapData(event.data, shift);
  const excludedRelease = ['upTime', 'semanticEndTime', 'lastObservedTime', 'dragStartTime'].some(
    (key) => typeof data[key] === 'number' && Number(data[key]) > end
  );
  if (excludedRelease) {
    for (const key of [
      'upTime',
      'upX',
      'upY',
      'pressDuration',
      'semanticEndTime',
      'dragStartTime',
      'clickCount',
      'dropObserved',
      'pointerCancelled',
    ])
      delete data[key];
    if (event.kind === 'CLICK') {
      data['maxExcursionCssPx'] = 0;
      data['gestureType'] = 'hold';
    }
    data['completion'] = 'lost';
    data['lastObservedTime'] = Math.min(end, time);
  }
  return [
    {
      ...event,
      time,
      data,
      ...(event.keyboardRepeats
        ? { keyboardRepeats: rhythm(event.keyboardRepeats, shift, end) }
        : {}),
    },
  ];
}

function projectSignal(
  signal: RecordingTelemetrySignal,
  segment: RecordingObservationClockSegment
) {
  const shift = offset(segment);
  const end = Math.min(86400, segment.mediaEndSeconds ?? 86400);
  const startTime = signal.startTime + shift;
  const endTime = Math.min(signal.endTime + shift, end);
  if (endTime < 0 || startTime > end) return [];
  if (signal.data['privacy'] === 'protected')
    return [
      {
        ...signal,
        startTime: Math.max(0, Math.floor(startTime)),
        endTime: Math.max(0, Math.ceil(endTime)),
      },
    ];
  const data = mapData(signal.data, shift);
  if (
    startTime < 0 ||
    ['upTime', 'lastObservedTime'].some(
      (key) => typeof data[key] === 'number' && Number(data[key]) > end
    )
  ) {
    for (const key of ['upTime', 'pressDuration']) delete data[key];
    if (startTime < 0) delete data['downTime'];
    data['completion'] = 'lost';
    data['lastObservedTime'] = Math.max(0, endTime);
  }
  return [
    {
      ...signal,
      startTime: Math.max(0, startTime),
      endTime: Math.max(0, endTime),
      data,
      ...(signal.keyboardRhythm
        ? { keyboardRhythm: rhythm(signal.keyboardRhythm, shift, end) }
        : {}),
      ...(signal.keyboardRepeats
        ? { keyboardRepeats: rhythm(signal.keyboardRepeats, shift, end) }
        : {}),
    },
  ];
}

/** Derives source-media copies; original observations, identities and physical durations stay intact. */
export function projectRecordingObservationClock<T extends Observations>(source: T): T {
  const clock = source.observationClock;
  if (!clock || clock.domain === 'media') return source;
  const segments = new Map(clock.segments.map((segment) => [segment.id, segment]));
  const find = (id: unknown) => (typeof id === 'string' ? segments.get(id) : undefined);
  const actionEvents = source.actionEvents.flatMap((event) => {
    const segment = find(event.data['observationClockId']);
    return segment ? projectAction(event, segment) : [event];
  });
  const signals = source.signals.flatMap((signal) => {
    const segment = find(signal.data['observationClockId']);
    return segment ? projectSignal(signal, segment) : [signal];
  });
  const samples = source.cursorTrack?.samples.flatMap((sample) => {
    const segment = find(sample.observationClockId);
    if (!segment) return [sample];
    const time = sample.time + offset(segment);
    return time < 0 || time > Math.min(86400, segment.mediaEndSeconds ?? 86400)
      ? []
      : [{ ...sample, time }];
  });
  return {
    ...source,
    observationClock: { ...clock, domain: 'media' },
    actionEvents,
    signals,
    cursorTrack: source.cursorTrack ? { ...source.cursorTrack, samples: samples ?? [] } : null,
  };
}
