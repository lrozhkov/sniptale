import { getScenarioProject } from '../../projects';
import type {
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../../../../../features/scenario/contracts/types/project';
import { getScenarioAssetBlob } from '../project-records/assets';
import {
  buildRecentScenarioSteps,
  buildTrashedScenarioSteps,
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

/** Lists trashed steps for restore-capable recorder surfaces. */
export async function listScenarioTrashedSteps(projectId: string): Promise<ScenarioTrashedStep[]> {
  const project = await getScenarioProject(projectId);
  if (!project) {
    return [];
  }

  return buildTrashedScenarioSteps(project);
}
