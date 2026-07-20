import { createScenarioCaptureStep } from '../../../../../features/scenario/project/public';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureStep,
  ScenarioProject,
} from '../../../../../features/scenario/contracts/types/project';
import type {
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioAssetEntry as DbScenarioAssetEntry } from '../../contracts';
import { getScenarioProject } from '../../projects';
import { mapScenarioAssetEntry } from '../project-records/helpers';
import {
  buildAutoScenarioCaptureOverlays,
  createScenarioCaptureEditorDocument,
} from '../../../../../features/scenario/capture-step/editor-document';
import { createScenarioAssetEntry, persistScenarioCaptureArtifacts } from './assets';

type SaveScenarioCaptureStepArgs = {
  projectId: string;
  dataUrl: string;
  galleryAssetId?: string | null;
  captureSurface: ScenarioCaptureSurface;
  sourceKind: ScenarioCaptureSourceKind;
  page: ScenarioPageDescriptor;
  target?: ScenarioTargetDescriptor | null;
  interactionPoint?: ScenarioPoint | null;
  cursorPoint?: ScenarioPoint | null;
  captureMetadata?: ScenarioCaptureStep['captureMetadata'];
  title?: string;
  body?: string;
};

function buildScenarioCaptureStep(args: {
  assetId: string;
  captureArgs: SaveScenarioCaptureStepArgs;
  overlays: ScenarioCaptureStep['overlays'];
}) {
  return createScenarioCaptureStep({
    assetId: args.assetId,
    ...(args.captureArgs.galleryAssetId === undefined
      ? {}
      : { galleryAssetId: args.captureArgs.galleryAssetId }),
    captureSurface: args.captureArgs.captureSurface,
    sourceKind: args.captureArgs.sourceKind,
    page: args.captureArgs.page,
    ...(args.captureArgs.target === undefined ? {} : { target: args.captureArgs.target }),
    ...(args.captureArgs.interactionPoint === undefined
      ? {}
      : { interactionPoint: args.captureArgs.interactionPoint }),
    ...(args.captureArgs.cursorPoint === undefined
      ? {}
      : { cursorPoint: args.captureArgs.cursorPoint }),
    ...(args.captureArgs.captureMetadata === undefined
      ? {}
      : { captureMetadata: args.captureArgs.captureMetadata }),
    overlays: args.overlays,
    ...(args.captureArgs.title === undefined ? {} : { title: args.captureArgs.title }),
    ...(args.captureArgs.body === undefined ? {} : { body: args.captureArgs.body }),
  });
}

function createScenarioCaptureEditorDocumentIfNeeded(args: {
  assetEntry: DbScenarioAssetEntry;
  dataUrl: string;
  overlays: ScenarioCaptureStep['overlays'];
}) {
  return args.overlays.length > 0
    ? createScenarioCaptureEditorDocument({
        dataUrl: args.dataUrl,
        overlays: args.overlays,
        sourceHeight: args.assetEntry.height,
        sourceWidth: args.assetEntry.width,
      })
    : null;
}

function appendStepToProject(
  project: ScenarioProject,
  step: ScenarioCaptureStep,
  updatedAt: number
) {
  return {
    ...project,
    updatedAt,
    steps: [...project.steps, step],
  };
}

/** Saves a capture step and immutable project-local asset into the target project. */
export async function saveScenarioCaptureStepToProject(args: SaveScenarioCaptureStepArgs): Promise<{
  project: ScenarioProject;
  step: ScenarioCaptureStep;
  asset: ScenarioAssetEntry;
}> {
  const project = await getScenarioProject(args.projectId);
  if (!project) {
    throw new Error(`Scenario project not found: ${args.projectId}`);
  }

  const { assetEntry, now } = await createScenarioAssetEntry(args);
  const overlays = buildAutoScenarioCaptureOverlays(args);
  const step = buildScenarioCaptureStep({
    assetId: assetEntry.id,
    captureArgs: args,
    overlays,
  });
  const updatedProject = appendStepToProject(project, step, now);
  const nextEditorDocument = createScenarioCaptureEditorDocumentIfNeeded({
    assetEntry,
    dataUrl: args.dataUrl,
    overlays,
  });

  const savedProject = await persistScenarioCaptureArtifacts({
    assetEntry,
    baseUpdatedAt: project.updatedAt,
    project: updatedProject,
    projectId: args.projectId,
    stepId: step.id,
    stepDocument: nextEditorDocument,
  });

  return {
    project: savedProject,
    step,
    asset: mapScenarioAssetEntry(assetEntry),
  };
}
