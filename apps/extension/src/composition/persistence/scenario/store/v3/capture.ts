import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioAssetRef,
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioProjectV3,
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
import { getScenarioProjectRecordV3 } from './project-records';
import { commitScenarioAggregateMutation } from '../../aggregate-mutations';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';

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
  project: ScenarioProjectV3;
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

  const saved = await commitScenarioAggregateMutation(updatedProject, {
    children: { assetPuts: [assetEntry] },
    expectedUpdatedAt: project.updatedAt,
  });
  publishMediaHubLibraryChanged('update', [`scenario:${project.id}`]);

  return {
    asset: mapScenarioAssetEntry(assetEntry),
    project: saved.project,
    slide,
  };
}
