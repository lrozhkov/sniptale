import type { ScenarioEditorAIRequestedStepChange } from '../../../../contracts/ai/scenario';
import type { ScenarioStepPatch } from '../../../../features/scenario/contracts/types/project';

export function createScenarioEditorAITextPatch(
  requestedChange: ScenarioEditorAIRequestedStepChange
): ScenarioStepPatch {
  const patch: ScenarioStepPatch = {};

  if (typeof requestedChange.title === 'string') {
    patch.title = requestedChange.title;
  }

  if (typeof requestedChange.body === 'string') {
    patch.body = requestedChange.body;
  }

  return patch;
}
