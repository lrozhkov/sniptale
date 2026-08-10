import {
  buildScenarioEditedCaptureStep,
  prepareScenarioEditedCaptureAsset,
} from '../../../../../workflows/scenario-capture-edit/edits';
import {
  getScenarioStepEditorDocumentRecord,
  prepareScenarioStepEditorDocumentRecord,
} from '../../../../../composition/persistence/scenario/store/step-editor-documents';
import { commitScenarioAggregateSnapshotMutation } from '../../../../../composition/persistence/scenario/aggregate-mutations';
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
  getCurrentProject: () => ScenarioProject | null;
  project: ScenarioProject | null;
  updateProject: ScenarioProjectSelectionActionArgs['updateProject'];
}) {
  return async (stepId: string, payload: { dataUrl: string; document: EditorDocument }) => {
    const project = args.getCurrentProject();
    const step = project?.steps.find((currentStep) => currentStep.id === stepId) ?? null;
    if (!project || !step || !isScenarioCaptureStep(step)) {
      return;
    }

    const editorDocument = prepareScenarioStepEditorDocumentRecord({
      stepId,
      projectId: project.id,
      document: payload.document,
    });

    const prepared = await prepareScenarioEditedCaptureAsset({
      dataUrl: payload.dataUrl,
      galleryAssetId: step.galleryAssetId,
      projectId: project.id,
    });
    const nextProject = {
      ...project,
      steps: project.steps.map((currentStep) =>
        currentStep.id === stepId && isScenarioCaptureStep(currentStep)
          ? buildScenarioEditedCaptureStep(currentStep, prepared.asset.id, payload.document)
          : currentStep
      ),
      updatedAt: getScenarioMutationTimestamp(),
    };
    const result = await commitScenarioAggregateSnapshotMutation({
      baseProject: project,
      children: { assetPuts: [prepared.entry], editorDocumentPuts: [editorDocument] },
      nextProject,
    });
    args.updateProject((current) => (Object.is(current, project) ? result.project : current));
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

    let clonedEditorDocument;
    if (clonedStep.kind === 'capture') {
      try {
        const source = await getScenarioStepEditorDocumentRecord(stepId);
        clonedEditorDocument = source
          ? prepareScenarioStepEditorDocumentRecord({
              document: structuredClone(source.document),
              projectId: currentProject.id,
              stepId: clonedStep.id,
            })
          : undefined;
      } catch (error) {
        args.setError(
          resolveScenarioActionErrorMessage(error, 'Failed to duplicate scenario capture step')
        );
        return;
      }
    }

    const nextSteps = currentProject.steps.slice();
    nextSteps.splice(currentIndex + 1, 0, clonedStep);
    try {
      const result = await commitScenarioAggregateSnapshotMutation({
        baseProject: currentProject,
        ...(clonedEditorDocument
          ? { children: { editorDocumentPuts: [clonedEditorDocument] } }
          : {}),
        nextProject: {
          ...currentProject,
          updatedAt: getScenarioMutationTimestamp(),
          steps: nextSteps,
        },
      });
      args.updateProject((project) =>
        Object.is(project, currentProject) ? result.project : project
      );
      args.setSelectedStepId(clonedStep.id);
    } catch (error) {
      args.setError(resolveScenarioActionErrorMessage(error, 'Failed to duplicate scenario step'));
    }
  };
}
