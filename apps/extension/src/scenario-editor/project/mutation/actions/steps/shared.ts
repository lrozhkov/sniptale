import {
  createScenarioDividerStep,
  createScenarioNoteStep,
  createScenarioSectionStep,
} from '../../../../../features/scenario/project/public';
import {
  deleteScenarioStep as moveScenarioStepToTrash,
  restoreScenarioStep,
} from '../../../../../features/scenario/project/step-mutations';
import type { ScenarioOverlay } from '../../../../../features/scenario/contracts/types/overlays';
import type {
  ScenarioCaptureStep,
  ScenarioProject,
  ScenarioStep,
  ScenarioStepPatch,
} from '../../../../../features/scenario/contracts/types/project';
import { insertStepAt, moveStep } from '../../helpers';
import { createScenarioMutationMetadata } from '../../timestamps';
import type { ScenarioProjectSelectionActionArgs, UpdateProject } from '../types';

function isScenarioCaptureStep(step: ScenarioStep): step is ScenarioCaptureStep {
  return step.kind === 'capture';
}

function createStep(kind: 'section' | 'note' | 'divider') {
  if (kind === 'section') {
    return createScenarioSectionStep({ title: '' });
  }
  if (kind === 'note') {
    return createScenarioNoteStep({ title: '' });
  }

  return createScenarioDividerStep();
}

function cloneOverlay(overlay: ScenarioOverlay): ScenarioOverlay {
  return {
    ...overlay,
    id: crypto.randomUUID(),
  };
}

export function duplicateScenarioStep(step: ScenarioStep): ScenarioStep {
  const timestamps = createScenarioMutationMetadata();
  const duplicatedStep: ScenarioStep = {
    ...step,
    id: crypto.randomUUID(),
    ...timestamps,
  };

  if (duplicatedStep.kind !== 'capture') {
    return duplicatedStep;
  }

  return {
    ...duplicatedStep,
    overlays: duplicatedStep.overlays.map(cloneOverlay),
  };
}

function buildMoveStepUpdater(
  stepId: string,
  resolveNextIndex: (currentIndex: number, stepCount: number) => number
) {
  return (currentProject: ScenarioProject) => {
    const currentIndex = currentProject.steps.findIndex((step) => step.id === stepId);
    if (currentIndex < 0) {
      return currentProject;
    }

    return moveStep(
      currentProject,
      currentIndex,
      resolveNextIndex(currentIndex, currentProject.steps.length)
    );
  };
}

export function resolveScenarioActionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createInsertStepAction(args: ScenarioProjectSelectionActionArgs) {
  return (index: number, kind: 'section' | 'note' | 'divider') => {
    const step = createStep(kind);
    args.setSelectedStepId(step.id);
    args.updateProject((currentProject) => insertStepAt(currentProject, index, step));
  };
}

export function createUpdateStepAction(
  applyStepPatch: (stepId: string, patch: ScenarioStepPatch) => void
) {
  return (stepId: string, patch: ScenarioStepPatch) => {
    applyStepPatch(stepId, patch);
  };
}

export function createMoveStepByOffsetAction(updateProject: UpdateProject) {
  return (stepId: string, offset: number) =>
    updateProject(
      buildMoveStepUpdater(stepId, (currentIndex, stepCount) =>
        Math.max(0, Math.min(stepCount - 1, currentIndex + offset))
      )
    );
}

export function createMoveStepToPositionAction(updateProject: UpdateProject) {
  return (stepId: string, position: number) =>
    updateProject(
      buildMoveStepUpdater(stepId, (_currentIndex, stepCount) =>
        Math.max(0, Math.min(stepCount - 1, position))
      )
    );
}

export function createDeleteStepAction(args: ScenarioProjectSelectionActionArgs) {
  return (stepId: string) =>
    args.updateProject((currentProject) => {
      const result = moveScenarioStepToTrash(currentProject, stepId);
      if (!result.deletedStep) {
        return currentProject;
      }

      const currentIndex = currentProject.steps.findIndex((step) => step.id === stepId);
      const nextSteps = result.project.steps;
      const nextSelectedStep = nextSteps[Math.min(currentIndex, nextSteps.length - 1)] ?? null;
      args.setSelectedStepId(nextSelectedStep?.id ?? null);

      return result.project;
    });
}

export function createRestoreStepAction(args: ScenarioProjectSelectionActionArgs) {
  return (stepId: string) =>
    args.updateProject((currentProject) => {
      const result = restoreScenarioStep(currentProject, stepId);
      if (!result.restoredStep) {
        return currentProject;
      }

      args.setSelectedStepId(result.restoredStep.id);
      return result.project;
    });
}

export { isScenarioCaptureStep };
