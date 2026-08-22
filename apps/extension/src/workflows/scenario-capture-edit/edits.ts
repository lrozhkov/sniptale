import type { EditorDocument } from '../../features/editor/document/types';
import { getDefaultScenarioImageTransform } from '../../features/scenario/project/defaults';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type { PreparedScenarioAssetEntry } from '../../composition/persistence/scenario/contracts';
import type { ScenarioCaptureStep } from '../../features/scenario/contracts/types/project';
import { createDefaultScenarioViewportTransform } from '../../features/scenario/stage/layout';
import { mapScenarioAssetEntry } from '../../composition/persistence/scenario/store/project-records/helpers';
import { projectCompatOverlaysFromEditorDocument } from '../../features/scenario/capture-step/editor-document';
import { createScenarioAssetEntryFromBlob } from '../../composition/persistence/scenario/store/capture-step/assets';
import { dataUrlToBlob } from '../../platform/media-utils/data-url';

export async function prepareScenarioEditedCaptureAsset(args: {
  dataUrl: string;
  galleryAssetId?: string | null;
  projectId: string;
}): Promise<{ asset: ScenarioAssetEntry; entry: PreparedScenarioAssetEntry }> {
  const blob = await dataUrlToBlob(args.dataUrl);
  const { assetEntry: entry } = await createScenarioAssetEntryFromBlob({
    blob,
    galleryAssetId: args.galleryAssetId ?? null,
    projectId: args.projectId,
  });

  return { asset: mapScenarioAssetEntry(entry), entry };
}

export function buildScenarioEditedCaptureStep(
  step: ScenarioCaptureStep,
  assetId: string,
  document: EditorDocument
): ScenarioCaptureStep {
  return {
    ...step,
    assetId,
    annotationRenderMode: 'asset',
    imageTransform: getDefaultScenarioImageTransform(),
    overlays: projectCompatOverlaysFromEditorDocument(document),
    updatedAt: Date.now(),
    viewportTransform: createDefaultScenarioViewportTransform(),
  };
}
