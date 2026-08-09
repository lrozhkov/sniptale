import { commitScenarioAggregateSnapshotMutation } from '../../../../../composition/persistence/scenario/aggregate-mutations';
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
      const nextProject = {
        ...currentProject,
        trash: currentProject.trash.filter((entry) => !clearedTrashStepIds.has(entry.step.id)),
        updatedAt: getScenarioMutationTimestamp(),
      };
      const result = await commitScenarioAggregateSnapshotMutation({
        baseProject: currentProject,
        children: {
          assetDeletes: clearedAssetIds,
          editorDocumentDeletes: clearedCaptureStepIds,
        },
        nextProject,
      });
      args.updateProject((project) =>
        Object.is(project, currentProject) ? result.project : project
      );
    } catch (error) {
      args.setError(resolveScenarioActionErrorMessage(error, 'Failed to clear scenario trash'));
      return;
    }
  };
}
