import type {
  ScenarioProject,
  ScenarioStep,
  ScenarioStepPatch,
} from '../../../../../features/scenario/contracts/types/project';
import { getScenarioMutationTimestamp, updateScenarioStep } from '../../helpers';
import {
  consumeScenarioStepRedo,
  consumeScenarioStepUndo,
  pushScenarioStepHistory,
  type ScenarioStepHistoryState,
} from './history';

export type CommitProjectState = (
  nextProject: ScenarioProject,
  nextHistoryState: ScenarioStepHistoryState
) => void;

function replaceProjectStep(
  project: ScenarioProject,
  stepId: string,
  nextStep: ScenarioStep
): ScenarioProject {
  return {
    ...project,
    updatedAt: getScenarioMutationTimestamp(),
    steps: project.steps.map((step) => (step.id === stepId ? nextStep : step)),
  };
}

function findScenarioProjectStep(project: ScenarioProject | null, stepId: string) {
  return project?.steps.find((step) => step.id === stepId) ?? null;
}

export function applySingleStepPatchToProject(args: {
  commitProjectState: CommitProjectState;
  patch: ScenarioStepPatch;
  project: ScenarioProject | null;
  stepId: string;
  stepHistoryState: ScenarioStepHistoryState;
}) {
  if (Object.keys(args.patch).length === 0) {
    return;
  }

  const currentStep = findScenarioProjectStep(args.project, args.stepId);
  if (!args.project || !currentStep) {
    return;
  }

  const nextStep = updateScenarioStep(currentStep, args.patch);
  const nextProject = replaceProjectStep(args.project, args.stepId, nextStep);
  const nextHistoryState = pushScenarioStepHistory(args.stepHistoryState, currentStep);

  args.commitProjectState(nextProject, nextHistoryState);
}

export function applyStepReplacementToProject(args: {
  commitProjectState: CommitProjectState;
  project: ScenarioProject | null;
  replaceStep: (step: ScenarioStep) => ScenarioStep;
  stepHistoryState: ScenarioStepHistoryState;
  stepId: string;
}) {
  const currentStep = findScenarioProjectStep(args.project, args.stepId);
  if (!args.project || !currentStep) {
    return;
  }

  const nextProject = replaceProjectStep(args.project, args.stepId, args.replaceStep(currentStep));
  const nextHistoryState = pushScenarioStepHistory(args.stepHistoryState, currentStep);

  args.commitProjectState(nextProject, nextHistoryState);
}

export function applyStepPatchBatchToProject(args: {
  commitProjectState: CommitProjectState;
  patches: Array<{ patch: ScenarioStepPatch; stepId: string }>;
  project: ScenarioProject | null;
  stepHistoryState: ScenarioStepHistoryState;
}) {
  if (!args.project || args.patches.length === 0) {
    return;
  }

  let nextProject = args.project;
  let nextHistoryState = args.stepHistoryState;

  for (const item of args.patches) {
    if (Object.keys(item.patch).length === 0) {
      continue;
    }

    const currentStep = findScenarioProjectStep(nextProject, item.stepId);
    if (!currentStep) {
      continue;
    }

    nextHistoryState = pushScenarioStepHistory(nextHistoryState, currentStep);
    nextProject = replaceProjectStep(
      nextProject,
      item.stepId,
      updateScenarioStep(currentStep, item.patch)
    );
  }

  args.commitProjectState(nextProject, nextHistoryState);
}

export function restoreScenarioStepHistoryChange(args: {
  commitProjectState: CommitProjectState;
  mode: 'redo' | 'undo';
  project: ScenarioProject | null;
  stepHistoryState: ScenarioStepHistoryState;
  stepId: string;
}) {
  const currentStep = findScenarioProjectStep(args.project, args.stepId);
  if (!args.project || !currentStep) {
    return;
  }

  const result =
    args.mode === 'undo'
      ? consumeScenarioStepUndo({
          currentStep,
          historyState: args.stepHistoryState,
        })
      : consumeScenarioStepRedo({
          currentStep,
          historyState: args.stepHistoryState,
        });

  if (!result.restoredStep) {
    return;
  }

  args.commitProjectState(
    replaceProjectStep(args.project, args.stepId, result.restoredStep),
    result.historyState
  );
}
