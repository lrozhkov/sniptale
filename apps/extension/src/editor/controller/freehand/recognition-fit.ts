import type { ModeledFreehandStroke } from './modeling';
import { resolveAngularCandidate } from './recognition-angular';
import { pickClosedRecognitionCandidate } from './recognition-ranking';
import { resolveRoundedCandidate } from './recognition-rounded';
import type { FreehandRecognitionCandidate } from './recognition-types';

export function resolveClosedShapeCandidate(
  modeledStroke: ModeledFreehandStroke
): FreehandRecognitionCandidate | null {
  return pickClosedRecognitionCandidate([
    resolveRoundedCandidate(modeledStroke),
    resolveAngularCandidate(modeledStroke),
  ]);
}
