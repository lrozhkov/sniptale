import {
  buildScenarioEditedCaptureStep,
  createScenarioEditedCaptureAsset,
} from '../../../../../workflows/scenario-capture-edit/edits';
import {
  cloneScenarioStepEditorDocumentRecord,
  saveScenarioStepEditorDocumentRecord,
} from '../../../../../composition/persistence/scenario/store/step-editor-documents';
import type { EditorDocument } from '../../../../../features/editor/document/types';
import type {
  ScenarioProject,
  ScenarioStep,
} from '../../../../../features/scenario/contracts/types/project';
import { getScenarioMutationTimestamp } from '../../timestamps';
import {
  duplicateScenarioStep,
  isScenarioCaptureStep,
  resolveScenarioActionErrorMessage,
} from './shared';
import type { ScenarioProjectSelectionActionArgs } from '../types';

export function createApplyEditedCaptureStepAction(args: {
  applyStepReplacement: (stepId: string, replaceStep: (step: ScenarioStep) => ScenarioStep) => void;
  project: ScenarioProject | null;
}) {
  return async (stepId: string, payload: { dataUrl: string; document: EditorDocument }) => {
    const step = args.project?.steps.find((currentStep) => currentStep.id === stepId) ?? null;
    if (!args.project || !step || !isScenarioCaptureStep(step)) {
      return;
    }

    await saveScenarioStepEditorDocumentRecord({
      stepId,
      projectId: args.project.id,
      document: payload.document,
    });

    const asset = await createScenarioEditedCaptureAsset({
      dataUrl: payload.dataUrl,
      galleryAssetId: step.galleryAssetId,
      projectId: args.project.id,
    });

    args.applyStepReplacement(stepId, (currentStep) =>
      isScenarioCaptureStep(currentStep)
        ? buildScenarioEditedCaptureStep(currentStep, asset.id, payload.document)
        : currentStep
    );
  };
}

export function createDuplicateStepAction(args: ScenarioProjectSelectionActionArgs) {
  return async (stepId: string) => {
    const currentProject = args.getCurrentProject();
    const currentIndex = currentProject?.steps.findIndex((step) => step.id === stepId) ?? -1;
    if (!currentProject || currentIndex < 0) {
      return;
    }

    const clonedStep = duplicateScenarioStep(currentProject.steps[currentIndex]!);
    args.setError(null);

    if (clonedStep.kind === 'capture') {
      try {
        await cloneScenarioStepEditorDocumentRecord({
          sourceStepId: stepId,
          nextProjectId: currentProject.id,
          nextStepId: clonedStep.id,
        });
      } catch (error) {
        args.setError(
          resolveScenarioActionErrorMessage(error, 'Failed to duplicate scenario capture step')
        );
        return;
      }
    }

    let inserted = false;
    args.updateProject((project) => {
      const sourceIndex = project.steps.findIndex((step) => step.id === stepId);
      if (sourceIndex < 0) {
        return project;
      }
      const nextSteps = project.steps.slice();
      nextSteps.splice(sourceIndex + 1, 0, clonedStep);
      inserted = true;

      return {
        ...project,
        updatedAt: getScenarioMutationTimestamp(),
        steps: nextSteps,
      };
    });

    if (inserted) {
      args.setSelectedStepId(clonedStep.id);
    }
  };
}
