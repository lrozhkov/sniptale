import type {
  ScenarioCaptureStep,
  ScenarioProject,
  ScenarioStep,
} from '../contracts/types/project';

function moveScenarioStepList(
  steps: ScenarioStep[],
  fromIndex: number,
  toIndex: number
): ScenarioStep[] {
  const nextSteps = steps.slice();
  const [step] = nextSteps.splice(fromIndex, 1);
  if (!step) {
    return steps;
  }

  nextSteps.splice(toIndex, 0, step);
  return nextSteps;
}

export function deleteScenarioStep(
  project: ScenarioProject,
  stepId: string
): {
  deletedStep: ScenarioStep | null;
  project: ScenarioProject;
} {
  const deletedIndex = project.steps.findIndex((step) => step.id === stepId);
  const deletedStep = deletedIndex >= 0 ? (project.steps[deletedIndex] ?? null) : null;
  if (!deletedStep) {
    return {
      deletedStep: null,
      project,
    };
  }

  return {
    deletedStep,
    project: {
      ...project,
      updatedAt: Date.now(),
      steps: project.steps.filter((step) => step.id !== stepId),
      trash: [
        {
          deletedAt: Date.now(),
          originalIndex: deletedIndex,
          step: deletedStep,
        },
        ...project.trash.filter((entry) => entry.step.id !== stepId),
      ],
    },
  };
}

export function restoreScenarioStep(
  project: ScenarioProject,
  stepId: string
): { project: ScenarioProject; restoredStep: ScenarioStep | null } {
  const trashEntry = project.trash.find((entry) => entry.step.id === stepId) ?? null;
  if (!trashEntry) {
    return { project, restoredStep: null };
  }

  const nextSteps = project.steps.slice();
  nextSteps.splice(
    Math.max(0, Math.min(trashEntry.originalIndex, nextSteps.length)),
    0,
    trashEntry.step
  );

  return {
    restoredStep: trashEntry.step,
    project: {
      ...project,
      updatedAt: Date.now(),
      steps: nextSteps,
      trash: project.trash.filter((entry) => entry.step.id !== stepId),
    },
  };
}

export function isCaptureScenarioStep(step: ScenarioStep): step is ScenarioCaptureStep {
  return step.kind === 'capture';
}

export function moveScenarioStep(
  project: ScenarioProject,
  stepId: string,
  toIndex: number
): ScenarioProject {
  const fromIndex = project.steps.findIndex((step) => step.id === stepId);
  if (fromIndex < 0) {
    return project;
  }

  const nextIndex = Math.max(0, Math.min(project.steps.length - 1, toIndex));
  if (nextIndex === fromIndex) {
    return project;
  }

  return {
    ...project,
    updatedAt: Date.now(),
    steps: moveScenarioStepList(project.steps, fromIndex, nextIndex),
  };
}
