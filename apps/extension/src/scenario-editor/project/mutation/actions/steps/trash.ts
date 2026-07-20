import { deleteScenarioAssetRecord } from '../../../../../composition/persistence/scenario/store/project-records/assets';
import { deleteScenarioStepEditorDocumentRecord } from '../../../../../composition/persistence/scenario/store/step-editor-documents';
import type {
  ScenarioCaptureStep,
  ScenarioProject,
} from '../../../../../features/scenario/contracts/types/project';
import { getScenarioMutationTimestamp } from '../../timestamps';
import { resolveScenarioActionErrorMessage } from './shared';
import type { ScenarioProjectSelectionActionArgs } from '../types';

function getClearedTrashCaptureStepIds(project: ScenarioProject): string[] {
  return project.trash
    .filter(
      (entry): entry is typeof entry & { step: ScenarioCaptureStep } =>
        entry.step.kind === 'capture'
    )
    .map((entry) => entry.step.id);
}

function getClearedTrashAssetIds(project: ScenarioProject): string[] {
  const activeAssetIds = new Set(
    project.steps
      .filter((step): step is ScenarioCaptureStep => step.kind === 'capture')
      .map((step) => step.assetId)
  );
  const clearedAssetIds = project.trash
    .filter(
      (entry): entry is typeof entry & { step: ScenarioCaptureStep } =>
        entry.step.kind === 'capture'
    )
    .map((entry) => entry.step.assetId)
    .filter((assetId) => !activeAssetIds.has(assetId));

  return Array.from(new Set(clearedAssetIds));
}

export function createClearTrashAction(args: ScenarioProjectSelectionActionArgs) {
  return async () => {
    const currentProject = args.getCurrentProject();
    if (!currentProject || currentProject.trash.length === 0) {
      return;
    }

    const clearedAssetIds = getClearedTrashAssetIds(currentProject);
    const clearedCaptureStepIds = getClearedTrashCaptureStepIds(currentProject);
    const clearedTrashStepIds = new Set(currentProject.trash.map((entry) => entry.step.id));

    args.setError(null);

    try {
      await Promise.all([
        ...clearedAssetIds.map((assetId) => deleteScenarioAssetRecord(assetId)),
        ...clearedCaptureStepIds.map((stepId) => deleteScenarioStepEditorDocumentRecord(stepId)),
      ]);
    } catch (error) {
      args.setError(resolveScenarioActionErrorMessage(error, 'Failed to clear scenario trash'));
      return;
    }

    args.updateProject((project) => {
      const nextTrash = project.trash.filter((entry) => !clearedTrashStepIds.has(entry.step.id));
      if (nextTrash.length === project.trash.length) {
        return project;
      }

      return {
        ...project,
        trash: nextTrash,
        updatedAt: getScenarioMutationTimestamp(),
      };
    });
  };
}
