import type { FreehandPointRecord } from '../points';
import type { FreehandRecognitionCandidate } from '../recognition-types';
import { buildDiamondPath, buildRectanglePath, buildTrianglePath } from './polygon';
import { buildRoundedPath } from './rounded';

export function buildClosedCandidatePath(
  candidate: FreehandRecognitionCandidate,
  points: readonly FreehandPointRecord[]
): FreehandPointRecord[] {
  switch (candidate.kind) {
    case 'arrow':
      return [];
    case 'circle':
      return buildRoundedPath(candidate, points);
    case 'diamond':
      return buildDiamondPath(candidate, points);
    case 'ellipse':
      return buildRoundedPath(candidate, points);
    case 'line':
      return [];
    case 'rectangle':
      return buildRectanglePath(candidate, points);
    case 'triangle':
      return buildTrianglePath(candidate, points);
  }
}
