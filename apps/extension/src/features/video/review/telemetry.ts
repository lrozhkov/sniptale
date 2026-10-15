import { buildHistoryCursorRuns } from './cursor-history';
import type { RecordingKeyboardRhythmBlock } from '../project/types/interaction';
import { resolveRecordingTarget, type RecordingTargetSemantics } from '../project/recording-target';
import { isRecordingPoint } from '../project/validation/recording-telemetry';
import { normalizeRecordingActions, normalizeRecordingSignals } from '../project/recording-actions';
import type {
  RecordingTelemetrySignal,
  RecordingActionEvent,
  VideoProjectCursorTrack,
  VideoProjectCursorSample,
} from '../project/types';

interface ReviewTelemetryInput {
  actionEvents: readonly RecordingActionEvent[];
  signals: readonly RecordingTelemetrySignal[];
  cursorTrack: VideoProjectCursorTrack | null;
}

/** Audio templates consume bounded facts, never recorded wording or event-count guesses. */
type ReviewActionSoundDescriptor =
  | { family: 'mouse' }
  | { family: 'keyboard'; keyCount: number }
  | { family: 'typing' };

export interface ReviewTelemetryMarker {
  ref: { kind: 'action' | 'signal' | 'cursor'; id: string };
  eventType: string;
  target?: string;
  targetSemantics?: RecordingTargetSemantics;
  audio?: ReviewActionSoundDescriptor;
  privacy?: 'protected';
  observed?: boolean;
  keyboardHold?: boolean;
  mouseButton?: number;
  keyboardRhythm?: RecordingKeyboardRhythmBlock[];
  keyboardRepeats?: RecordingKeyboardRhythmBlock[];
  keyboardAttack?: { id: string; time: number };
  gesture?: {
    id: string;
    type: string;
    button: number;
    downTime: number;
    upTime?: number;
    observedEndTime?: number;
    completion: string;
    path?: { time: number; x: number; y: number; captureSegment?: number }[];
    gaps?: { start: number; end: number }[];
  };
  /** Verified normalized source position, never reconstructed from a final viewport. */
  focusPoint?: { x: number; y: number };
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
  const warnings = 0;
  const add = reviewMarkerWriter(markers, duration);
  const actions = normalizeRecordingActions(input.actionEvents);
  const cursorSamples = [...(input.cursorTrack?.samples ?? [])].sort((a, b) => a.time - b.time);
  const verifiedCursor = cursorSamples
    .flatMap((sample) =>
      sample.visible && isRecordingPoint(sample.recordingPoint)
        ? [
            {
              time: sample.time,
              x: sample.recordingPoint.x,
              y: sample.recordingPoint.y,
              captureSegment: sample.captureSegment,
            },
          ]
        : []
    )
    .sort((a, b) => a.time - b.time);
  for (const event of actions) {
    const gesture = recordedGesture(event);
    const keyboardOnset = event.kind === 'KEY' ? event.data['keyboardOnsetTime'] : undefined;
    const observedKeyboard =
      typeof keyboardOnset === 'number' && Number.isFinite(keyboardOnset) && keyboardOnset >= 0;
    const keyboardEnds = observedKeyboard
      ? [event.data['upTime'], event.data['lastObservedTime']].filter(
          (value): value is number =>
            typeof value === 'number' && Number.isFinite(value) && value >= keyboardOnset
        )
      : [];
    const keyboardEnd = observedKeyboard ? Math.max(keyboardOnset, ...keyboardEnds) : undefined;
    const type = reviewActionEventType(
      event,
      gesture,
      observedKeyboard,
      keyboardOnset,
      keyboardEnd
    );
    add(
      'action',
      event.id,
      type,
      event.time,
      gesture?.observedEndTime ?? keyboardEnd ?? event.time + event.duration,
      event.label || undefined,
      event.recordingPoint,
      event.kind === 'CLICK' ? resolveRecordingTarget(event.data) : undefined,
      event.kind === 'CLICK'
        ? { family: 'mouse' }
        : event.kind === 'KEY'
          ? { family: 'keyboard', keyCount: canonicalKeyboardCount(event.data['combo']) }
          : undefined
    );
    const marker = markers.at(-1);
    if (marker?.ref.id !== event.id || marker.ref.kind !== 'action') continue;
    if (gesture || typeof event.data['keyboardOnsetTime'] === 'number') marker.observed = true;
    if (
      event.kind === 'CLICK' &&
      typeof event.data['button'] === 'number' &&
      Number.isInteger(event.data['button']) &&
      event.data['button'] >= 0 &&
      event.data['button'] <= 31
    )
      marker.mouseButton = event.data['button'];
    if (gesture) appendMarkerGesture(marker, gesture, cursorSamples, verifiedCursor);
    if (
      typeof event.data['keyboardAttackId'] === 'string' &&
      typeof event.data['keyboardOnsetTime'] === 'number'
    ) {
      marker.keyboardAttack = {
        id: event.data['keyboardAttackId'],
        time: event.data['keyboardOnsetTime'],
      };
    }
    if (event.keyboardRepeats) marker.keyboardRepeats = event.keyboardRepeats;
  }
  for (const signal of normalizeRecordingSignals(input.signals)) {
    if (signal.kind === 'static-frame') continue;
    const target = signal.data['targetName'];
    add(
      'signal',
      signal.id,
      signal.data['keyboardHold'] === true ? 'KEY_HOLD' : signal.kind,
      signal.startTime,
      signal.endTime,
      typeof target === 'string' ? target : undefined,
      signalFocusPoint(signal, actions),
      undefined,
      signal.kind === 'typing' &&
        signal.data['privacy'] !== 'protected' &&
        signal.data['keyboardHold'] !== true
        ? { family: 'typing' }
        : undefined
    );
    const marker = markers.at(-1);
    if (marker?.ref.id === signal.id && marker.ref.kind === 'signal') {
      if (signal.data['privacy'] === 'protected') marker.privacy = 'protected';
      if (signal.data['keyboardHold'] === true) marker.keyboardHold = true;
      if (
        typeof signal.data['captureSegment'] === 'number' ||
        signal.data['activity'] === 'input' ||
        signal.data['activity'] === 'keyboard'
      )
        marker.observed = true;
      if (signal.keyboardRhythm) marker.keyboardRhythm = signal.keyboardRhythm;
      if (signal.keyboardRepeats) marker.keyboardRepeats = signal.keyboardRepeats;
    }
  }
  if (includeCursor)
    for (const run of buildHistoryCursorRuns(
      input.cursorTrack,
      duration,
      input.signals.filter((signal) => signal.kind === 'cursor-idle')
    )) {
      if (!run.recordedDwell) add('cursor', run.id, run.kind, run.start, run.end);
    }
  markers.sort((a, b) => a.start - b.start || a.ref.id.localeCompare(b.ref.id));
  return { markers, warnings };
}

/** Capture's combo has modifier prefixes; '+' itself is one key. Unknown legacy labels use one cue. */
function canonicalKeyboardCount(value: unknown): number {
  if (typeof value !== 'string' || !value || value.length > 120) return 1;
  let rest = value;
  const modifiers = new Set<string>();
  for (;;) {
    const prefix = /^(Meta|Ctrl|Alt|Shift)\+/u.exec(rest);
    if (!prefix) break;
    const modifier = prefix[1]!;
    if (modifiers.has(modifier)) return 1;
    modifiers.add(modifier);
    rest = rest.slice(prefix[0].length);
  }
  return rest && (rest === '+' || !rest.includes('+')) ? modifiers.size + 1 : 1;
}

/** Typing may reuse a recent verified click on that exact field; raw CSS points are not video positions. */
function signalFocusPoint(
  signal: RecordingTelemetrySignal,
  actions: readonly RecordingActionEvent[]
) {
  if (isRecordingPoint(signal.recordingPoint)) return signal.recordingPoint;
  if (signal.kind !== 'typing' || typeof signal.data['targetId'] !== 'string') return null;
  const click = actions.findLast(
    (action) =>
      action.kind === 'CLICK' &&
      action.time <= signal.startTime &&
      signal.startTime - action.time <= 1 &&
      action.data['targetId'] === signal.data['targetId']
  );
  return click?.recordingPoint;
}

function recordedGesture(
  event: RecordingActionEvent
): ReviewTelemetryMarker['gesture'] | undefined {
  const data = event.data;
  const id = data['gestureId'];
  const type = data['gestureType'];
  const button = data['button'];
  const downTime = data['downTime'];
  const upTime = data['upTime'];
  const completion = data['completion'];
  if (
    typeof id !== 'string' ||
    typeof type !== 'string' ||
    !['click', 'hold', 'drag', 'selection', 'native-drag'].includes(type) ||
    typeof button !== 'number' ||
    typeof downTime !== 'number' ||
    !Number.isFinite(downTime) ||
    typeof completion !== 'string'
  )
    return undefined;
  const ends = [upTime, data['semanticEndTime'], data['lastObservedTime']].filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= downTime
  );
  return {
    id,
    type,
    button,
    downTime,
    completion,
    observedEndTime: ends.length ? Math.max(...ends) : downTime,
    ...(typeof upTime === 'number' && Number.isFinite(upTime) && upTime >= downTime
      ? { upTime }
      : {}),
  };
}

/** Evidence of unobserved source time suppresses visual feedback without inventing a release. */
function gestureObservationGaps(
  samples: Readonly<VideoProjectCursorTrack['samples']>,
  start: number,
  end: number
) {
  const gaps: { start: number; end: number }[] = [];
  let low = 0,
    high = samples.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (samples[mid]!.time < start) low = mid + 1;
    else high = mid;
  }
  for (
    let index = Math.max(0, low - 1);
    index < samples.length && samples[index]!.time < end;
    index++
  ) {
    const sample = samples[index]!;
    const next = samples[index + 1];
    const unavailable =
      !sample.visible ||
      !isRecordingPoint(sample.recordingPoint) ||
      (sample.observation !== undefined && sample.observation !== 'observed') ||
      (next !== undefined && sample.captureSegment !== next.captureSegment);
    if (!unavailable) continue;
    const gapStart = Math.max(start, sample.time),
      gapEnd = Math.min(end, next?.time ?? end);
    if (gapEnd <= gapStart) continue;
    const previous = gaps.at(-1);
    if (previous && previous.end === gapStart) previous.end = gapEnd;
    else gaps.push({ start: gapStart, end: gapEnd });
  }
  return gaps;
}

function reviewActionEventType(
  event: RecordingActionEvent,
  gesture: ReturnType<typeof recordedGesture>,
  observedKeyboard: boolean,
  keyboardOnset: unknown,
  keyboardEnd: number | undefined
): string {
  const type =
    gesture &&
    gesture.completion !== 'released' &&
    (gesture.type === 'click' || gesture.completion !== 'semantic')
      ? 'PRESS_UNRESOLVED'
      : gesture && gesture.type !== 'click'
        ? gesture.type.toUpperCase().replace('-', '_')
        : event.kind === 'CLICK' && event.data['clickCount'] === 2
          ? 'DOUBLE_CLICK'
          : event.kind === 'SCROLL' && event.data['eventType'] === 'wheel'
            ? 'WHEEL'
            : observedKeyboard && event.data['modifierOnly'] === true
              ? 'KEY_MODIFIERS'
              : observedKeyboard &&
                  (keyboardEnd! - (typeof keyboardOnset === 'number' ? keyboardOnset : 0) >= 0.5 ||
                    (typeof event.data['repeatCount'] === 'number' &&
                      event.data['repeatCount'] > 0))
                ? 'KEY_HOLD'
                : event.kind;
  return type;
}

function appendMarkerGesture(
  marker: ReviewTelemetryMarker,
  gesture: NonNullable<ReturnType<typeof recordedGesture>>,
  cursorSamples: readonly VideoProjectCursorSample[],
  verifiedCursor: readonly {
    time: number;
    x: number;
    y: number;
    captureSegment: number | undefined;
  }[]
): void {
  let low = 0,
    high = verifiedCursor.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (verifiedCursor[mid]!.time < gesture.downTime) low = mid + 1;
    else high = mid;
  }
  const path: NonNullable<NonNullable<ReviewTelemetryMarker['gesture']>['path']> = [];
  for (let index = low; index < verifiedCursor.length; index++) {
    const sample = verifiedCursor[index]!;
    if (sample.time > (gesture.observedEndTime ?? gesture.downTime)) break;
    path.push({
      time: sample.time,
      x: sample.x,
      y: sample.y,
      ...(sample.captureSegment === undefined ? {} : { captureSegment: sample.captureSegment }),
    });
  }
  const gaps = gestureObservationGaps(
    cursorSamples,
    gesture.downTime,
    gesture.observedEndTime ?? gesture.downTime
  );
  marker.gesture = {
    ...gesture,
    ...(path.length ? { path } : {}),
    ...(gaps.length ? { gaps } : {}),
  };
}

function reviewMarkerWriter(markers: ReviewTelemetryMarker[], duration: number) {
  return (
    kind: ReviewTelemetryMarker['ref']['kind'],
    id: string,
    eventType: string,
    start: number,
    end: number,
    target?: string,
    point?: { x: number; y: number } | null,
    targetSemantics?: RecordingTargetSemantics,
    audio?: ReviewActionSoundDescriptor
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
      ...(targetSemantics ? { targetSemantics } : {}),
      ...(audio ? { audio } : {}),
      start,
      end: Math.min(duration, end),
      ...(target ? { target: target.slice(0, 120) } : {}),
      ...(isRecordingPoint(point) ? { focusPoint: { ...point } } : {}),
    });
  };
}
