import { getScenarioProject } from '../../projects';
import type { ScenarioRecentStep } from '../../../../../features/scenario/contracts/types/project';
import { getScenarioAssetBlob } from '../project-records/assets';
import {
  buildRecentScenarioSteps,
  buildGuidePreviewSteps,
} from '../../../../../features/scenario/project/step-projections';

/** Lists recent capture steps with preview data. */
export async function listRecentScenarioSteps(
  projectId: string,
  limit = 7
): Promise<ScenarioRecentStep[]> {
  const project = await getScenarioProject(projectId);
  if (!project) {
    return [];
  }

  return buildRecentScenarioSteps({
    getAssetBlob: getScenarioAssetBlob,
    limit,
    project,
  });
}

/** Returns a small library preview; complete readers load the full guide. */
export async function listScenarioPreviewSteps(projectId: string): Promise<ScenarioRecentStep[]> {
  const project = await getScenarioProject(projectId);
  return project ? buildGuidePreviewSteps({ project, getAssetBlob: getScenarioAssetBlob }) : [];
}
