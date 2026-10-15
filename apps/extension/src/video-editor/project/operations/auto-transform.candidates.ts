import { deriveLongRecordingTypingSignals } from '../../../features/video/project/recording-actions';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import {
  VideoAutoProcessingAction,
  type VideoAutoProcessingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { mergeTimeRanges, type TimeRange } from './time-ranges';

export type AutoProcessingAudio =
  | { status: 'absent' | 'unavailable' }
  | { status: 'analyzed'; ranges: TimeRange[] };
interface AutoDetectionOptions {
  typingRate: number;
  audio: AutoProcessingAudio;
}
interface AutoTransformCandidate extends TimeRange {
  action: VideoAutoProcessingAction;
  playbackRate: number;
  category: 'typing' | 'idle';
}
function intersect(ranges: TimeRange[], mask: TimeRange[]): TimeRange[] {
  return ranges.flatMap((a) =>
    mask.flatMap((b) => {
      const startTime = Math.max(a.startTime, b.startTime);
      const endTime = Math.min(a.endTime, b.endTime);
      return endTime > startTime ? [{ startTime, endTime }] : [];
    })
  );
}
function subtract(ranges: TimeRange[], excluded: TimeRange[]): TimeRange[] {
  return excluded.reduce(
    (remaining, cut) =>
      remaining.flatMap((range) => {
        if (cut.endTime <= range.startTime || cut.startTime >= range.endTime) return [range];
        return [
          ...(cut.startTime > range.startTime
            ? [{ startTime: range.startTime, endTime: cut.startTime }]
            : []),
          ...(cut.endTime < range.endTime
            ? [{ startTime: cut.endTime, endTime: range.endTime }]
            : []),
        ];
      }),
    ranges
  );
}
function stationaryRanges(telemetry: RecordingTelemetryEntry): TimeRange[] {
  const signals = telemetry.signals.filter((signal) => signal.kind === 'cursor-idle');
  if (signals.length) return mergeTimeRanges(signals, 0);
  const samples = telemetry.cursorTrack?.samples ?? [];
  const ranges: TimeRange[] = [];
  let anchor = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1]!;
    const current = samples[i]!;
    if (
      !anchor ||
      !previous.visible ||
      !current.visible ||
      (previous.observation !== undefined && previous.observation !== 'observed') ||
      (current.observation !== undefined && current.observation !== 'observed') ||
      previous.captureSegment !== current.captureSegment ||
      current.time <= previous.time ||
      Math.hypot(current.x - anchor.x, current.y - anchor.y) > 2
    ) {
      anchor = current;
      continue;
    }
    ranges.push({ startTime: previous.time, endTime: current.time });
  }
  return mergeTimeRanges(ranges, 0);
}
/** Source-time candidates are disjoint: input is never mistaken for an idle pause. */
export function buildAutoTransformCandidates(
  telemetry: RecordingTelemetryEntry,
  settings: VideoAutoProcessingSettings['stableSegments'],
  options: AutoDetectionOptions = { typingRate: 2, audio: { status: 'absent' } }
): AutoTransformCandidate[] {
  if (options.audio.status === 'unavailable') return [];
  const inputActivity = telemetry.signals.filter((signal) => signal.kind === 'typing');
  const typing = mergeTimeRanges(
    deriveLongRecordingTypingSignals(
      inputActivity.filter((signal) => signal.data['privacy'] !== 'protected')
    ).filter((signal) => signal.kind === 'typing'),
    0
  );
  const silent = (ranges: TimeRange[]) =>
    options.audio.status === 'analyzed' ? intersect(ranges, options.audio.ranges) : ranges;
  const candidates: AutoTransformCandidate[] =
    options.typingRate > 1
      ? silent(
          subtract(typing, [
            ...inputActivity.filter((signal) => signal.data['privacy'] === 'protected'),
            ...unobservedRanges(telemetry),
          ])
        )
          .filter((range) => range.endTime - range.startTime >= 0.5)
          .map((range) => ({
            ...range,
            action: 'speed-up',
            playbackRate: options.typingRate,
            category: 'typing',
          }))
      : [];
  if (settings.action !== VideoAutoProcessingAction.SKIP) {
    const activity = observedActionActivity(telemetry);
    const idle = subtract(silent(stationaryRanges(telemetry)), [
      ...inputActivity,
      ...activity,
      ...unobservedRanges(telemetry),
    ]);
    for (const range of idle) {
      const startTime = range.startTime + settings.shoulderSeconds;
      const endTime = range.endTime - settings.shoulderSeconds;
      if (endTime - startTime >= settings.minDurationSeconds)
        candidates.push({
          startTime,
          endTime,
          action: settings.action,
          playbackRate: settings.speedUpPlaybackRate,
          category: 'idle',
        });
    }
  }
  return candidates.sort((a, b) => a.startTime - b.startTime);
}

/** Unavailable observation and capture-segment boundaries cannot prove inactivity. */
function unobservedRanges(telemetry: RecordingTelemetryEntry): TimeRange[] {
  const samples = telemetry.cursorTrack?.samples ?? [];
  const end = Math.max(
    0,
    ...telemetry.signals
      .filter((signal) => signal.kind === 'typing' || signal.kind === 'cursor-idle')
      .map((signal) => signal.endTime),
    samples.at(-1)?.time ?? 0
  );
  return samples.flatMap((sample, index) => {
    const next = samples[index + 1];
    const unavailable =
      !sample.visible ||
      (sample.observation !== undefined && sample.observation !== 'observed') ||
      (next !== undefined && sample.captureSegment !== next.captureSegment);
    const endTime = next?.time ?? end;
    return unavailable && endTime > sample.time ? [{ startTime: sample.time, endTime }] : [];
  });
}

/** Recorded edges bound activity; presentation durations never shorten a real press. */
function observedActionActivity(telemetry: RecordingTelemetryEntry): TimeRange[] {
  const duration = Math.max(
    0,
    ...telemetry.signals
      .filter((signal) => signal.kind === 'typing' || signal.kind === 'cursor-idle')
      .map((signal) => signal.endTime),
    telemetry.cursorTrack?.samples.at(-1)?.time ?? 0
  );
  return telemetry.actionEvents
    .filter((event) => event.kind !== 'PAUSE')
    .map((event) => {
      const data = event.data;
      const observedEnd = [
        data['upTime'],
        data['semanticEndTime'],
        data['lastObservedTime'],
      ].filter(
        (value): value is number =>
          typeof value === 'number' && Number.isFinite(value) && value >= event.time
      );
      const recordedPress = typeof data['downTime'] === 'number';
      const endTime = observedEnd.length
        ? Math.max(...observedEnd)
        : recordedPress
          ? Math.max(event.time, duration)
          : event.time + Math.max(0.1, event.duration);
      return { startTime: event.time, endTime };
    });
}
