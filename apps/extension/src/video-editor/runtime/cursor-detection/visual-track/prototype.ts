import type { VideoCursorDetectionCandidate } from './types';

export interface CursorPrototypeSize {
  count: number;
  height: number;
  width: number;
}

export function updateCursorPrototypeSize(
  current: CursorPrototypeSize | null,
  candidate: VideoCursorDetectionCandidate
): CursorPrototypeSize {
  if (!current) {
    return { count: 1, height: candidate.height, width: candidate.width };
  }
  const nextCount = current.count + 1;
  return {
    count: nextCount,
    height: (current.height * current.count + candidate.height) / nextCount,
    width: (current.width * current.count + candidate.width) / nextCount,
  };
}
