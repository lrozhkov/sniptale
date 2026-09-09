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
  const typing = mergeTimeRanges(
    telemetry.signals.filter((signal) => signal.kind === 'typing'),
    0
  );
  const silent = (ranges: TimeRange[]) =>
    options.audio.status === 'analyzed' ? intersect(ranges, options.audio.ranges) : ranges;
  const candidates: AutoTransformCandidate[] =
    options.typingRate > 1
      ? silent(typing)
          .filter((range) => range.endTime - range.startTime >= 0.5)
          .map((range) => ({
            ...range,
            action: 'speed-up',
            playbackRate: options.typingRate,
            category: 'typing',
          }))
      : [];
  if (settings.action !== VideoAutoProcessingAction.SKIP) {
    const activity = telemetry.actionEvents
      .filter((event) => event.kind !== 'PAUSE')
      .map((event) => ({
        startTime: event.time,
        endTime: event.time + Math.max(0.1, event.duration),
      }));
    // Never bridge a gap across input or audible sound, regardless of merge-gap preference.
    const idle = subtract(silent(stationaryRanges(telemetry)), [...typing, ...activity]);
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
