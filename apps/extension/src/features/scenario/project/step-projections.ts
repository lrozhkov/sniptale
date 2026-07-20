import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import type {
  ScenarioCaptureStep,
  ScenarioProject,
  ScenarioRecentStep,
  ScenarioTrashedStep,
} from '../contracts/types/project';

export async function buildRecentScenarioSteps(args: {
  getAssetBlob: (assetId: string) => Promise<Blob | undefined>;
  limit?: number;
  project: ScenarioProject;
}): Promise<ScenarioRecentStep[]> {
  const captureSteps = args.project.steps
    .filter((step): step is ScenarioCaptureStep => step.kind === 'capture')
    .slice(-(args.limit ?? 7))
    .reverse();

  const loadedSteps: Array<ScenarioRecentStep | null> = await Promise.all(
    captureSteps.map(async (step): Promise<ScenarioRecentStep | null> => {
      const assetBlob = await args.getAssetBlob(step.assetId);
      if (!assetBlob) {
        return null;
      }

      return {
        id: step.id,
        metadata: {
          captureMetadata: step.captureMetadata,
          captureSurface: step.captureSurface,
          cursorPoint: step.cursorPoint,
          interactionPoint: step.interactionPoint,
          page: step.page,
          sourceKind: step.sourceKind,
          target: step.target,
        },
        position: args.project.steps.findIndex((projectStep) => projectStep.id === step.id),
        previewDataUrl: await blobToDataUrl(assetBlob),
        title: step.title || step.body || step.id,
      };
    })
  );

  return loadedSteps.filter((step): step is ScenarioRecentStep => step !== null);
}

export function buildTrashedScenarioSteps(project: ScenarioProject): ScenarioTrashedStep[] {
  return project.trash.map((entry) => ({
    id: entry.step.id,
    deletedAt: entry.deletedAt,
    kind: entry.step.kind,
    originalIndex: entry.originalIndex,
    title: entry.step.title || entry.step.body || entry.step.id,
  }));
}
