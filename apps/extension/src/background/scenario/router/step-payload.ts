import { getScenarioAsset } from '../../../composition/persistence/scenario/projects';
import type { ScenarioAssetEntry } from '../../../composition/persistence/scenario/contracts';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { getScenarioProjectRecordV3 } from '../../../composition/persistence/scenario/store/v3';
import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../../../features/scenario/contracts/types/project';
import type {
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';

function isScenarioCaptureSurface(value: string | null): value is ScenarioCaptureSurface {
  return value === 'visible' || value === 'full' || value === 'selection';
}

function isScenarioCaptureSourceKind(value: string | null): value is ScenarioCaptureSourceKind {
  return value === 'manual' || value === 'auto-click';
}

function getSlideTitle(slide: ScenarioSlide): string {
  return slide.title || slide.notes || slide.id;
}

function resolveScenarioAssetPreviewBlob(asset: ScenarioAssetEntry): Blob {
  if (asset.blob.type || !asset.mimeType) {
    return asset.blob;
  }

  return new Blob([asset.blob], { type: asset.mimeType });
}

async function buildRecentScenarioStepFromSlide(args: {
  position: number;
  slide: ScenarioSlide;
}): Promise<ScenarioRecentStep | null> {
  const { slide } = args;
  if (slide.source.kind !== 'capture') {
    return null;
  }

  const asset = await getScenarioAsset(slide.source.assetId);
  if (!asset) {
    return null;
  }

  return {
    id: slide.id,
    metadata: {
      captureMetadata: slide.source.captureMetadata,
      captureSurface: isScenarioCaptureSurface(slide.source.captureSurface)
        ? slide.source.captureSurface
        : 'visible',
      cursorPoint: slide.source.cursorPoint,
      interactionPoint: slide.source.interactionPoint,
      page: slide.source.page,
      sourceKind: isScenarioCaptureSourceKind(slide.source.sourceKind)
        ? slide.source.sourceKind
        : 'manual',
      target: slide.source.target,
    },
    position: args.position,
    previewDataUrl: await blobToDataUrl(resolveScenarioAssetPreviewBlob(asset)),
    title: getSlideTitle(slide),
  };
}

async function listRecentScenarioStepsV3(
  project: ScenarioProjectV3
): Promise<ScenarioRecentStep[]> {
  const captureSlides = project.slides
    .map((slide, position) => ({ slide, position }))
    .filter(({ slide }) => slide.source.kind === 'capture')
    .slice(-7)
    .reverse();
  const recentSteps = await Promise.all(captureSlides.map(buildRecentScenarioStepFromSlide));

  return recentSteps.filter((step): step is ScenarioRecentStep => step !== null);
}

function listScenarioTrashedStepsV3(project: ScenarioProjectV3): ScenarioTrashedStep[] {
  return project.trash.map((entry) => ({
    id: entry.slide.id,
    deletedAt: entry.deletedAt,
    kind: entry.slide.source.kind === 'capture' ? 'capture' : 'note',
    originalIndex: entry.originalIndex,
    title: getSlideTitle(entry.slide),
  }));
}

export async function buildScenarioProjectStepPayload(projectId: string | null): Promise<{
  recentSteps: ScenarioRecentStep[];
  trashedSteps: ScenarioTrashedStep[];
}> {
  if (!projectId) {
    return { recentSteps: [], trashedSteps: [] };
  }

  const project = await getScenarioProjectRecordV3(projectId);
  if (!project) {
    return { recentSteps: [], trashedSteps: [] };
  }

  return {
    recentSteps: await listRecentScenarioStepsV3(project),
    trashedSteps: listScenarioTrashedStepsV3(project),
  };
}
