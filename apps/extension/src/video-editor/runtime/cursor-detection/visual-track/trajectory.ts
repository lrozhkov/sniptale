import type { VideoObjectTrackSample } from '../../../../features/video/project/object-tracks';
import type { VideoObjectTrackAnalysisMetadata } from '../../../../features/video/project/object-tracks';

const MAX_REASONABLE_SPEED_PX_PER_SECOND = 900;
const BOUNCE_BACK_RATIO = 0.35;

export function cleanVisualCursorTrackSamples(
  samples: readonly VideoObjectTrackSample[]
): VideoObjectTrackSample[] {
  const cleaned = samples.map((sample) => ({ ...sample }));

  for (let index = 1; index < cleaned.length - 1; index += 1) {
    const previous = findVisibleBefore(cleaned, index);
    const current = cleaned[index];
    const next = findVisibleAfter(cleaned, index);
    if (!previous || !current || !current.visible || !next) {
      continue;
    }

    const inDistance = sampleDistance(previous, current);
    const outDistance = sampleDistance(current, next);
    const bridgeDistance = sampleDistance(previous, next);
    const inSpeed = inDistance / Math.max(0.001, current.time - previous.time);
    const outSpeed = outDistance / Math.max(0.001, next.time - current.time);
    const bounceBack =
      inDistance > 160 &&
      outDistance > 160 &&
      bridgeDistance < Math.max(inDistance, outDistance) * BOUNCE_BACK_RATIO;

    if (bounceBack || Math.min(inSpeed, outSpeed) > MAX_REASONABLE_SPEED_PX_PER_SECOND) {
      cleaned[index] = { ...current, confidence: 0, visible: false };
    }
  }

  return cleaned;
}

export function summarizeVisualCursorTrackQuality(
  samples: readonly VideoObjectTrackSample[]
): NonNullable<VideoObjectTrackAnalysisMetadata['quality']> {
  const visibleSamples = samples.filter((sample) => sample.visible);
  const jumpCount = countLargeJumps(visibleSamples);
  const coverageRatio = samples.length === 0 ? 0 : visibleSamples.length / samples.length;
  const medianConfidence = median(visibleSamples.map((sample) => sample.confidence));
  const status =
    visibleSamples.length < 2 || coverageRatio < 0.18
      ? 'unusable'
      : jumpCount > Math.max(1, Math.floor(visibleSamples.length / 3))
        ? 'needsAnchor'
        : 'usable';

  return {
    coverageRatio,
    jumpCount,
    medianConfidence,
    status,
    visibleSamples: visibleSamples.length,
  };
}

function countLargeJumps(samples: readonly VideoObjectTrackSample[]): number {
  return samples.slice(1).filter((sample, index) => sampleDistance(samples[index]!, sample) > 220)
    .length;
}

function findVisibleBefore(
  samples: readonly VideoObjectTrackSample[],
  index: number
): VideoObjectTrackSample | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (samples[cursor]?.visible) {
      return samples[cursor]!;
    }
  }
  return null;
}

function findVisibleAfter(
  samples: readonly VideoObjectTrackSample[],
  index: number
): VideoObjectTrackSample | null {
  for (let cursor = index + 1; cursor < samples.length; cursor += 1) {
    if (samples[cursor]?.visible) {
      return samples[cursor]!;
    }
  }
  return null;
}

function sampleDistance(left: VideoObjectTrackSample, right: VideoObjectTrackSample): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
