import type { VideoObjectTrackSample } from '../../../../features/video/project/object-tracks';
import { detectCursorCandidates } from './detector';
import type {
  CursorCandidateDetectionOptions,
  VideoCursorDetectionAnchor,
  VideoCursorDetectionCandidate,
  VideoCursorDetectionFrame,
} from './types';
import { clamp01 } from './pixels';

const LOCK_DISTANCE_PX = 96;
const MAX_MISSES_BEFORE_REACQUIRE = 3;
const STATIC_HISTORY_BUCKET_PX = 12;

interface CandidateSelectionState {
  missedFrames: number;
  previousSample: VideoObjectTrackSample | null;
  prototypeSize: { count: number; height: number; width: number } | null;
  staticHistory: Map<string, number>;
}

export function resolveFrameCandidates(
  frame: VideoCursorDetectionFrame,
  previousMotion: VideoCursorDetectionCandidate[],
  nextMotion: VideoCursorDetectionCandidate[],
  state: CandidateSelectionState,
  detectionOptions: CursorCandidateDetectionOptions | undefined
): VideoCursorDetectionCandidate[] {
  const contrastCandidates = detectCursorCandidates(frame, detectionOptions);
  recordStaticHistory(contrastCandidates, state.staticHistory);
  const temporalMotion = resolveTemporalMotionCandidates(previousMotion, nextMotion);
  return [
    ...scoreMotionCandidates(temporalMotion, contrastCandidates),
    ...scoreContrastCandidates(contrastCandidates, temporalMotion, state.staticHistory),
  ]
    .toSorted((first, second) => second.confidence - first.confidence)
    .slice(0, 12);
}

export function selectCandidate(
  candidates: VideoCursorDetectionCandidate[],
  state: CandidateSelectionState,
  seedAnchor: VideoCursorDetectionAnchor | null
): VideoCursorDetectionCandidate | null {
  const prototypeBoosted = boostCandidatesNearPrototype(candidates, state.prototypeSize);
  const boosted = seedAnchor
    ? boostCandidatesNearAnchor(prototypeBoosted, seedAnchor)
    : prototypeBoosted;
  if (state.previousSample?.visible && state.missedFrames <= MAX_MISSES_BEFORE_REACQUIRE) {
    return (
      boosted
        .filter(
          (candidate) => distanceToSample(candidate, state.previousSample!) <= LOCK_DISTANCE_PX
        )
        .toSorted((first, second) => second.confidence - first.confidence)[0] ?? null
    );
  }
  const acquisitionCandidates = seedAnchor
    ? boosted
    : boosted.filter((candidate) => candidate.source === 'motion' || candidate.motionScore > 0);
  return (
    acquisitionCandidates.toSorted((first, second) => second.confidence - first.confidence)[0] ??
    null
  );
}

function boostCandidatesNearPrototype(
  candidates: VideoCursorDetectionCandidate[],
  prototypeSize: CandidateSelectionState['prototypeSize']
): VideoCursorDetectionCandidate[] {
  if (!prototypeSize || prototypeSize.count < 2) {
    return candidates;
  }
  return candidates.map((candidate) => {
    const delta =
      Math.abs(candidate.width - prototypeSize.width) +
      Math.abs(candidate.height - prototypeSize.height);
    const boost = Math.max(-0.18, 0.18 - delta / 120);
    return { ...candidate, confidence: clamp01(candidate.confidence + boost) };
  });
}

function resolveTemporalMotionCandidates(
  previousMotion: VideoCursorDetectionCandidate[],
  nextMotion: VideoCursorDetectionCandidate[]
): VideoCursorDetectionCandidate[] {
  if (previousMotion.length === 0) {
    return nextMotion.map((candidate) => ({
      ...candidate,
      confidence: candidate.confidence * 0.7,
    }));
  }
  const stable = previousMotion.flatMap((candidate) => {
    const match = findNearestCandidate(nextMotion, candidate.centerX, candidate.centerY, 24);
    return match
      ? [
          {
            ...candidate,
            confidence: clamp01((candidate.confidence + match.confidence) / 2 + 0.22),
          },
        ]
      : [];
  });
  const fallback = previousMotion.map((candidate) => ({
    ...candidate,
    confidence: candidate.confidence * 0.52,
  }));
  return [...stable, ...fallback].toSorted((first, second) => second.confidence - first.confidence);
}

function scoreMotionCandidates(
  motionCandidates: VideoCursorDetectionCandidate[],
  contrastCandidates: VideoCursorDetectionCandidate[]
): VideoCursorDetectionCandidate[] {
  return motionCandidates.map((candidate) => {
    const nearContrast = findNearestCandidate(
      contrastCandidates,
      candidate.centerX,
      candidate.centerY,
      18
    );
    const contrastBoost = nearContrast ? nearContrast.shapeScore * 0.22 : 0;
    return {
      ...candidate,
      confidence: clamp01(candidate.confidence + contrastBoost),
      shapeScore: nearContrast?.shapeScore ?? 0,
    };
  });
}

function scoreContrastCandidates(
  contrastCandidates: VideoCursorDetectionCandidate[],
  motionCandidates: VideoCursorDetectionCandidate[],
  staticHistory: Map<string, number>
): VideoCursorDetectionCandidate[] {
  return contrastCandidates.map((candidate) => {
    const nearMotion = findNearestCandidate(
      motionCandidates,
      candidate.centerX,
      candidate.centerY,
      18
    );
    const staticPenalty = resolveHistoryPenalty(candidate, staticHistory);
    return {
      ...candidate,
      confidence: clamp01(
        candidate.confidence * staticPenalty + (nearMotion?.motionScore ?? 0) * 0.65
      ),
      motionScore: nearMotion?.motionScore ?? 0,
      staticPenalty: candidate.staticPenalty * staticPenalty,
    };
  });
}

function recordStaticHistory(
  candidates: VideoCursorDetectionCandidate[],
  staticHistory: Map<string, number>
): void {
  const frameKeys = new Set<string>();
  for (const candidate of candidates.slice(0, 8)) {
    frameKeys.add(candidateHistoryKey(candidate));
  }
  for (const key of frameKeys) {
    staticHistory.set(key, (staticHistory.get(key) ?? 0) + 1);
  }
}

function resolveHistoryPenalty(
  candidate: VideoCursorDetectionCandidate,
  staticHistory: Map<string, number>
): number {
  const hits = staticHistory.get(candidateHistoryKey(candidate)) ?? 0;
  if (hits >= 3 && candidate.motionScore === 0) {
    return 0.25;
  }
  if (hits >= 2 && candidate.motionScore === 0) {
    return 0.55;
  }
  return 1;
}

function candidateHistoryKey(candidate: VideoCursorDetectionCandidate): string {
  return `${Math.round(candidate.centerX / STATIC_HISTORY_BUCKET_PX)}:${Math.round(
    candidate.centerY / STATIC_HISTORY_BUCKET_PX
  )}`;
}

function boostCandidatesNearAnchor(
  candidates: VideoCursorDetectionCandidate[],
  anchor: VideoCursorDetectionAnchor
): VideoCursorDetectionCandidate[] {
  return candidates.map((candidate) => {
    const distance = Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y);
    const radius = Math.max(anchor.width ?? 96, anchor.height ?? 96, 96);
    const boost = distance <= radius ? 0.55 * (1 - distance / radius) : -0.35;
    return { ...candidate, confidence: clamp01(candidate.confidence + boost) };
  });
}

function findNearestCandidate(
  candidates: VideoCursorDetectionCandidate[],
  x: number,
  y: number,
  maxDistance: number
): VideoCursorDetectionCandidate | null {
  let nearest: VideoCursorDetectionCandidate | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.centerX - x, candidate.centerY - y);
    if (distance <= maxDistance && distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function distanceToSample(
  candidate: VideoCursorDetectionCandidate,
  sample: VideoObjectTrackSample
): number {
  return Math.hypot(candidate.x - sample.x, candidate.y - sample.y);
}
