import type {
  ScenarioEditorAIRequestedStepChange,
  ScenarioEditorAppliedPatch,
} from '../../../../../contracts/ai/scenario';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import { createScenarioEditorAIPatchForStep } from './step';

export function applyScenarioEditorAIResponse(args: {
  assetsById: Map<string, ScenarioAssetEntry>;
  project: ScenarioProject;
  steps: ScenarioEditorAIRequestedStepChange[];
}): ScenarioEditorAppliedPatch[] {
  const patches: ScenarioEditorAppliedPatch[] = [];

  for (const requestedChange of args.steps) {
    const patch = createScenarioEditorAIPatchForStep(
      {
        assetsById: args.assetsById,
        project: args.project,
      },
      requestedChange
    );
    if (patch) {
      patches.push(patch);
    }
  }

  return patches;
}
