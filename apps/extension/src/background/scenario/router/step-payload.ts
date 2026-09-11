import { listRecentScenarioSteps } from '../../../composition/persistence/scenario/store/project-steps';
import type { ScenarioRecentStep } from '../../../features/scenario/contracts/types/project';

/** Builds the capture session preview from the canonical project reader. */
export async function buildScenarioProjectStepPayload(projectId: string | null): Promise<{
  recentSteps: ScenarioRecentStep[];
}> {
  return { recentSteps: projectId ? await listRecentScenarioSteps(projectId) : [] };
}
