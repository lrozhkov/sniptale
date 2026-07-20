import { createModeledFreehandStroke } from './modeling';
import { resolveArrowCandidate, resolveLineCandidate } from './open-fit';
import type { FreehandPointRecord } from './points';
import { resolveClosedShapeCandidate } from './recognition-fit';
import type { FreehandRecognitionCandidate } from './recognition-types';

const MIN_RECOGNITION_SPAN = 12;
const MIN_RECOGNITION_POINTS = 5;
const ARROW_PRIORITY_MARGIN = 0.05;

export function recognizeFreehandShape(
  rawPoints: readonly FreehandPointRecord[]
): FreehandRecognitionCandidate | null {
  if (rawPoints.length < MIN_RECOGNITION_POINTS) {
    return null;
  }

  const modeledStroke = createModeledFreehandStroke(rawPoints);
  if (!modeledStroke) {
    return null;
  }

  if (Math.max(modeledStroke.bounds.width, modeledStroke.bounds.height) < MIN_RECOGNITION_SPAN) {
    return null;
  }

  if (modeledStroke.closed) {
    return resolveClosedShapeCandidate(modeledStroke);
  }

  const arrowCandidate = resolveArrowCandidate(modeledStroke);
  const lineCandidate = resolveLineCandidate(modeledStroke);
  if (!arrowCandidate) {
    return lineCandidate;
  }

  return !lineCandidate ||
    arrowCandidate.confidence + ARROW_PRIORITY_MARGIN >= lineCandidate.confidence
    ? arrowCandidate
    : lineCandidate;
}
