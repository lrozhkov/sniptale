import {
  deleteScenarioAsset,
  saveScenarioAsset,
} from '../../composition/persistence/scenario/projects';
import type { EditorDocument } from '../../features/editor/document/types';
import { dataUrlToBlob } from '../../platform/media-utils/data-url';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { getDefaultScenarioImageTransform } from '../../features/scenario/project/defaults';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioCaptureStep } from '../../features/scenario/contracts/types/project';
import { createDefaultScenarioViewportTransform } from '../../features/scenario/stage/layout';
import {
  createScenarioAssetId,
  mapScenarioAssetEntry,
} from '../../composition/persistence/scenario/store/project-records/helpers';
import { projectCompatOverlaysFromEditorDocument } from '../../features/scenario/capture-step/editor-document';

export async function createScenarioEditedCaptureAsset(args: {
  dataUrl: string;
  galleryAssetId?: string | null;
  projectId: string;
}): Promise<ScenarioAssetEntry> {
  const now = Date.now();
  const assetId = createScenarioAssetId();
  const blob = await dataUrlToBlob(args.dataUrl);
  const dimensions = await measureImageBlob(blob);

  await saveScenarioAsset({
    id: assetId,
    projectId: args.projectId,
    galleryAssetId: args.galleryAssetId ?? null,
    blob,
    mimeType: blob.type || 'image/png',
    width: dimensions.width,
    height: dimensions.height,
    createdAt: now,
    size: blob.size,
  });

  return mapScenarioAssetEntry({
    id: assetId,
    projectId: args.projectId,
    galleryAssetId: args.galleryAssetId ?? null,
    blob,
    mimeType: blob.type || 'image/png',
    width: dimensions.width,
    height: dimensions.height,
    createdAt: now,
    size: blob.size,
  });
}

export function deleteScenarioEditedCaptureAsset(assetId: string): Promise<void> {
  return deleteScenarioAsset(assetId);
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
