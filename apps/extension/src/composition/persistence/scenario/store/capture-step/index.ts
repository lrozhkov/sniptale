import {
  createGuideImageBlock,
  createGuideParagraphs,
  createGuideStep,
} from '../../../../../features/scenario/project/public';
import type {
  GuideCaptureSource,
  GuideProject,
  GuideStep,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
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
  captureSurface: GuideCaptureSource['captureSurface'];
  sourceKind: GuideCaptureSource['sourceKind'];
  page: GuideCaptureSource['page'];
  target?: GuideCaptureSource['target'];
  interactionPoint?: GuideCaptureSource['interactionPoint'];
  cursorPoint?: GuideCaptureSource['cursorPoint'];
  captureMetadata?: GuideCaptureSource['captureMetadata'];
  title?: string;
  body?: string;
};

/** Publishes the captured image and optional annotation document with one new guide step. */
export async function saveScenarioCaptureStepToProject(args: SaveScenarioCaptureStepArgs): Promise<{
  project: GuideProject;
  step: GuideStep;
  asset: ScenarioAssetEntry;
}> {
  const project = await getScenarioProject(args.projectId);
  if (!project) throw new Error('Scenario project not found.');
  const { assetEntry, now } = await createScenarioAssetEntry(args);
  const overlays = buildAutoScenarioCaptureOverlays(args);
  const document = overlays.length
    ? createScenarioCaptureEditorDocument({
        dataUrl: args.dataUrl,
        overlays,
        sourceHeight: assetEntry.height,
        sourceWidth: assetEntry.width,
      })
    : null;
  const editDocumentId = document ? crypto.randomUUID() : null;
  const step = createGuideStep(args.title ?? '');
  if (args.body)
    step.blocks.push({
      kind: 'text',
      id: crypto.randomUUID(),
      paragraphs: createGuideParagraphs(args.body),
    });
  step.blocks.push(
    createGuideImageBlock({
      id: crypto.randomUUID(),
      assetId: assetEntry.id,
      width: assetEntry.width,
      height: assetEntry.height,
      galleryAssetId: args.galleryAssetId ?? null,
      editDocumentId,
      source: {
        kind: 'capture',
        captureSurface: args.captureSurface,
        sourceKind: args.sourceKind,
        page: args.page,
        target: args.target ?? null,
        interactionPoint: args.interactionPoint ?? null,
        cursorPoint: args.cursorPoint ?? null,
        captureMetadata: args.captureMetadata ?? {
          pointerRange: null,
          scroll: null,
          trigger: 'pointer-up',
        },
      },
    })
  );
  const savedProject = await persistScenarioCaptureArtifacts({
    assetEntry,
    baseUpdatedAt: project.updatedAt,
    project: { ...project, updatedAt: now, items: [...project.items, step] },
    projectId: project.id,
    stepId: editDocumentId ?? step.id,
    stepDocument: document,
  });
  return { project: savedProject, step, asset: mapScenarioAssetEntry(assetEntry) };
}
