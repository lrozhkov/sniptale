import type {
  ScenarioEditorAIRequestedStepChange,
  ScenarioEditorAppliedPatch,
} from '../../../../../contracts/ai/scenario';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import { createCaptureStepPatch } from '../capture-step-patch';
import { createScenarioEditorAIAppliedPatch } from './applied-patch';
import { createScenarioEditorAITextPatch } from '../text-patch';

export function createScenarioEditorAIPatchForStep(
  args: {
    assetsById: Map<string, ScenarioAssetEntry>;
    project: ScenarioProject;
  },
  requestedChange: ScenarioEditorAIRequestedStepChange
): ScenarioEditorAppliedPatch | null {
  const step = args.project.steps.find((currentStep) => currentStep.id === requestedChange.stepId);
  if (!step) {
    return null;
  }

  if (step.kind !== 'capture') {
    const patch = createScenarioEditorAITextPatch(requestedChange);
    return Object.keys(patch).length > 0
      ? createScenarioEditorAIAppliedPatch(step.id, patch)
      : null;
  }

  const asset = args.assetsById.get(step.assetId);
  if (!asset) {
    const patch = createScenarioEditorAITextPatch(requestedChange);
    return Object.keys(patch).length > 0
      ? createScenarioEditorAIAppliedPatch(step.id, patch)
      : null;
  }

  const patch = createCaptureStepPatch({
    asset,
    requestedChange,
    step,
  });

  return Object.keys(patch).length > 0 ? createScenarioEditorAIAppliedPatch(step.id, patch) : null;
}
