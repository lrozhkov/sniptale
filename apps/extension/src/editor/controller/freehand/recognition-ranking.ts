import { MIN_CLOSED_CONFIDENCE } from './recognition-closed-constants';
import type { FreehandRecognitionCandidate } from './recognition-types';

const AMBIGUITY_MARGIN = 0.06;

export function pickClosedRecognitionCandidate(
  candidates: Array<FreehandRecognitionCandidate | null>
): FreehandRecognitionCandidate | null {
  const rankedCandidates = candidates
    .filter((candidate): candidate is FreehandRecognitionCandidate => Boolean(candidate))
    .sort((left, right) => right.confidence - left.confidence);
  const bestCandidate = rankedCandidates[0];
  if (!bestCandidate || bestCandidate.confidence < MIN_CLOSED_CONFIDENCE) {
    return null;
  }

  const nextCandidate = rankedCandidates[1];
  if (
    nextCandidate &&
    bestCandidate.kind !== nextCandidate.kind &&
    bestCandidate.confidence - nextCandidate.confidence < AMBIGUITY_MARGIN
  ) {
    return null;
  }

  return bestCandidate;
}
