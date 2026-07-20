import {
  createDefaultScenarioPageDescriptor,
  createScenarioCaptureStep,
} from '../../../../../features/scenario/project/public';
import {
  createScenarioAssetEntryFromBlob,
  persistScenarioCaptureArtifacts,
} from '../../../../../composition/persistence/scenario/store/capture-step/assets';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import type { UpdateProject } from '../types';
import { insertStepAt } from '../../helpers';
import type { ScenarioEditorInsertImagePayload } from '../../../state/types';

function resolveInsertedImageTitle(payload: ScenarioEditorInsertImagePayload): string {
  const candidate = (payload.sourceTitle ?? payload.filename).trim();
  if (!candidate) {
    return '';
  }

  return candidate.replace(/\.[a-z0-9]+$/i, '');
}

function createInsertedImagePage(payload: ScenarioEditorInsertImagePayload) {
  return {
    ...createDefaultScenarioPageDescriptor(),
    title: payload.sourceTitle ?? null,
    url: payload.sourceUrl ?? null,
  };
}

export function createInsertImageStepAction(args: {
  getCurrentProject: () => ScenarioProject | null;
  project: ScenarioProject | null;
  setSelectedStepId: (stepId: string | null) => void;
  updateProject: UpdateProject;
}) {
  return async (index: number, payload: ScenarioEditorInsertImagePayload) => {
    const initialProject = args.project;
    if (!initialProject) {
      return;
    }

    const { assetEntry } = await createScenarioAssetEntryFromBlob({
      blob: payload.blob,
      galleryAssetId: payload.galleryAssetId ?? null,
      projectId: initialProject.id,
    });
    const currentProject = args.getCurrentProject();
    if (!currentProject || currentProject.id !== initialProject.id) {
      return;
    }

    const step = createScenarioCaptureStep({
      assetId: assetEntry.id,
      galleryAssetId: payload.galleryAssetId ?? null,
      page: createInsertedImagePage(payload),
      title: resolveInsertedImageTitle(payload),
    });
    const nextProject = insertStepAt(currentProject, index, step);

    const savedProject = await persistScenarioCaptureArtifacts({
      assetEntry,
      baseUpdatedAt: currentProject.updatedAt,
      project: nextProject,
      projectId: currentProject.id,
      stepDocument: null,
      stepId: step.id,
    });

    args.setSelectedStepId(step.id);
    args.updateProject(() => savedProject);
  };
}
