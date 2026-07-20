import type { ScenarioEditorAppliedPatch } from '../../../../../contracts/ai/scenario';
import type { ScenarioStepPatch } from '../../../../../features/scenario/contracts/types/project';

export function createScenarioEditorAIAppliedPatch(
  stepId: string,
  patch: ScenarioStepPatch
): ScenarioEditorAppliedPatch {
  return {
    stepId,
    patch,
  };
}
