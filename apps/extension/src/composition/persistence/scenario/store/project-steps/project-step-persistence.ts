import { getScenarioProject, saveScenarioProject } from '../../projects';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  deleteScenarioStep,
  moveScenarioStep,
} from '../../../../../features/scenario/project/step-mutations';

async function saveProjectIfChanged(args: {
  currentProject: GuideProject;
  nextProject: GuideProject;
}) {
  if (args.nextProject === args.currentProject) {
    return args.currentProject;
  }

  return saveScenarioProject(args.nextProject, { baseUpdatedAt: args.currentProject.updatedAt });
}

/** Removes a scenario step from the guide. */
export async function deleteScenarioStepFromProject(
  projectId: string,
  stepId: string
): Promise<GuideProject | undefined> {
  const project = await getScenarioProject(projectId);
  if (!project) {
    return undefined;
  }

  const result = deleteScenarioStep(project, stepId);
  if (!result.deletedStep) {
    return project;
  }

  return saveProjectIfChanged({
    currentProject: project,
    nextProject: result.project,
  });
}

/** Reorders a scenario step within the same project. */
export async function moveScenarioStepInProject(
  projectId: string,
  stepId: string,
  toIndex: number
): Promise<GuideProject | undefined> {
  const project = await getScenarioProject(projectId);
  if (!project) {
    return undefined;
  }

  return saveProjectIfChanged({
    currentProject: project,
    nextProject: moveScenarioStep(project, stepId, toIndex),
  });
}
