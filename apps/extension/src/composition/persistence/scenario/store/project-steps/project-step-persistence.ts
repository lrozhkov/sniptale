import { getScenarioProject, saveScenarioProject } from '../../projects';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import {
  deleteScenarioStep,
  moveScenarioStep,
  restoreScenarioStep,
} from '../../../../../features/scenario/project/step-mutations';

async function saveProjectIfChanged(args: {
  currentProject: ScenarioProject;
  nextProject: ScenarioProject;
}) {
  if (args.nextProject === args.currentProject) {
    return args.currentProject;
  }

  return saveScenarioProject(args.nextProject, { baseUpdatedAt: args.currentProject.updatedAt });
}

/** Moves a scenario step into the project trash. */
export async function deleteScenarioStepFromProject(
  projectId: string,
  stepId: string
): Promise<ScenarioProject | undefined> {
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

/** Restores a scenario step from the project trash. */
export async function restoreScenarioStepFromProject(
  projectId: string,
  stepId: string
): Promise<ScenarioProject | undefined> {
  const project = await getScenarioProject(projectId);
  if (!project) {
    return undefined;
  }

  const result = restoreScenarioStep(project, stepId);
  if (!result.restoredStep) {
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
): Promise<ScenarioProject | undefined> {
  const project = await getScenarioProject(projectId);
  if (!project) {
    return undefined;
  }

  return saveProjectIfChanged({
    currentProject: project,
    nextProject: moveScenarioStep(project, stepId, toIndex),
  });
}
