import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import {
  VideoAutoProcessingAction,
  type VideoAutoProcessingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingTelemetrySignal } from '../../../features/video/project/types/interaction';
import { buildStableSignalIntersections, mergeTimeRanges, type TimeRange } from './time-ranges';

const OVERLAP_MERGE_GAP_SECONDS = 0;

export type AutoTransformCandidate = {
  action: VideoAutoProcessingAction;
  endTime: number;
  playbackRate: number;
  startTime: number;
};

function buildStableRanges(
  signals: Parameters<typeof buildStableSignalIntersections>[0],
  settings: VideoAutoProcessingSettings['stableSegments']
): TimeRange[] {
  const ranges = buildStableSignalIntersections(signals, (range) => ({
    startTime: range.startTime + settings.shoulderSeconds,
    endTime: range.endTime - settings.shoulderSeconds,
  }));

  return ranges.filter((range) => range.endTime - range.startTime >= settings.minDurationSeconds);
}

function buildStaticCandidates(
  signals: RecordingTelemetrySignal[],
  settings: VideoAutoProcessingSettings['stableSegments']
): AutoTransformCandidate[] {
  if (settings.action === VideoAutoProcessingAction.SKIP) {
    return [];
  }

  return mergeTimeRanges(buildStableRanges(signals, settings), settings.mergeGapSeconds).map(
    (range) => ({
      ...range,
      action: settings.action,
      playbackRate: settings.speedUpPlaybackRate,
    })
  );
}

function mergeAutoTransformCandidates(
  candidates: AutoTransformCandidate[]
): AutoTransformCandidate[] {
  const sortedCandidates = [...candidates].sort((left, right) => left.startTime - right.startTime);
  const merged: AutoTransformCandidate[] = [];

  for (const candidate of sortedCandidates) {
    const previous = merged.at(-1);
    if (!previous || candidate.startTime > previous.endTime + OVERLAP_MERGE_GAP_SECONDS) {
      merged.push({ ...candidate });
      continue;
    }

    previous.endTime = Math.max(previous.endTime, candidate.endTime);
    previous.playbackRate = Math.max(previous.playbackRate, candidate.playbackRate);
    if (candidate.action === VideoAutoProcessingAction.REMOVE) {
      previous.action = VideoAutoProcessingAction.REMOVE;
    }
  }

  return merged;
}

function sanitizeStableSettings(
  settings: VideoAutoProcessingSettings['stableSegments']
): VideoAutoProcessingSettings['stableSegments'] {
  return {
    ...settings,
    mergeGapSeconds: Math.max(0, settings.mergeGapSeconds),
    minDurationSeconds: Math.max(0.1, settings.minDurationSeconds),
    shoulderSeconds: Math.max(0, settings.shoulderSeconds),
    speedUpPlaybackRate: Math.max(1, settings.speedUpPlaybackRate),
  };
}

export function buildAutoTransformCandidates(
  telemetry: RecordingTelemetryEntry,
  settings: VideoAutoProcessingSettings['stableSegments']
): AutoTransformCandidate[] {
  const signals = telemetry.signals;
  return mergeAutoTransformCandidates(
    buildStaticCandidates(signals, sanitizeStableSettings(settings))
  );
}
