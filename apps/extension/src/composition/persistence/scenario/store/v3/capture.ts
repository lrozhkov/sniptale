import { deleteScenarioAsset, saveScenarioAsset } from '../../projects';
import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioAssetRef,
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioSlide,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioAssetEntry } from '../capture-step/assets';
import { mapScenarioAssetEntry } from '../project-records/helpers';
import {
  appendScenarioCaptureSlide,
  createDefaultCaptureMetadata,
  createScenarioCaptureSlide,
} from '../../../../../features/scenario/stage/capture-build';
import { getScenarioProjectRecordV3, saveScenarioProjectRecordV3 } from './project-records';

export interface ScenarioCaptureSlideSaveArgs {
  body?: string;
  captureMetadata?: ScenarioCaptureMetadata;
  captureSurface: ScenarioCaptureSurface;
  cursorPoint?: ScenarioPoint | null;
  dataUrl: string;
  galleryAssetId?: string | null;
  interactionPoint?: ScenarioPoint | null;
  page: ScenarioPageDescriptor;
  projectId: string;
  sourceKind: ScenarioCaptureSourceKind;
  target?: ScenarioTargetDescriptor | null;
  title?: string;
}

export async function saveScenarioCaptureSlideToProject(
  args: ScenarioCaptureSlideSaveArgs
): Promise<{
  project: Awaited<ReturnType<typeof saveScenarioProjectRecordV3>>;
  slide: ScenarioSlide;
  asset: ReturnType<typeof mapScenarioAssetEntry>;
}> {
  const project = await getScenarioProjectRecordV3(args.projectId);
  if (!project) {
    throw new Error(`Scenario project not found: ${args.projectId}`);
  }

  const { assetEntry, now } = await createScenarioAssetEntry(args);
  const assetRef = {
    assetId: assetEntry.id,
    galleryAssetId: args.galleryAssetId ?? null,
  } satisfies ScenarioAssetRef;
  const slide = createScenarioCaptureSlide({
    assetRef,
    assetSize: { height: assetEntry.height, width: assetEntry.width },
    body: args.body ?? '',
    captureMetadata: args.captureMetadata ?? createDefaultCaptureMetadata(),
    captureSurface: args.captureSurface,
    cursorPoint: args.cursorPoint ?? null,
    interactionPoint: args.interactionPoint ?? null,
    now,
    page: args.page,
    slideIndex: project.slides.length,
    sourceKind: args.sourceKind,
    target: args.target ?? null,
    title: args.title ?? '',
  });
  const updatedProject = appendScenarioCaptureSlide(project, slide, now);

  await saveScenarioAsset(assetEntry);
  const savedProject = await saveCaptureProjectWithRollback(
    updatedProject,
    assetEntry.id,
    project.updatedAt
  );

  return {
    asset: mapScenarioAssetEntry(assetEntry),
    project: savedProject,
    slide,
  };
}

async function saveCaptureProjectWithRollback(
  project: Parameters<typeof saveScenarioProjectRecordV3>[0],
  assetId: string,
  baseUpdatedAt: number
): ReturnType<typeof saveScenarioProjectRecordV3> {
  try {
    return await saveScenarioProjectRecordV3(project, { baseUpdatedAt });
  } catch (error: unknown) {
    return rollbackCaptureAsset(assetId, error);
  }
}

async function rollbackCaptureAsset(assetId: string, cause: unknown): Promise<never> {
  try {
    await deleteScenarioAsset(assetId);
  } catch (rollbackError: unknown) {
    throw new AggregateError(
      [cause, rollbackError],
      'Failed to save capture project and roll back capture asset'
    );
  }

  throw cause;
}
