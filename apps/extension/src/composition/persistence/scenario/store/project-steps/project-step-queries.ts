import { getScenarioProject } from '../../projects';
import type {
  ScenarioRecentStep,
  ScenarioPreviewStep,
} from '../../../../../features/scenario/contracts/types/project';
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

/** Returns complete library preview metadata without acquiring image bytes. */
export async function listScenarioPreviewSteps(projectId: string): Promise<ScenarioPreviewStep[]> {
  const project = await getScenarioProject(projectId);
  return project ? buildGuidePreviewSteps({ project }) : [];
}
