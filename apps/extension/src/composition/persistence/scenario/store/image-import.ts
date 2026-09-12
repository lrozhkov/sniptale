import { z } from 'zod';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import {
  GUIDE_LIMITS,
  type GuideProject,
  type GuideImageSource,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { assertImportableProjectImage } from '../../../../features/media-hub/project-assets';
import { publishMediaHubLibraryChanged } from '../../../../features/media-hub/events';
import {
  createGuideImageBlock,
  createGuideParagraphs,
  createGuideStep,
} from '../../../../features/scenario/project/public';
import { getAggregatePresentation } from '../../aggregate-presentations';
import { getMediaLibraryEntry } from '../../media-library';
import { recoverAndGetImageWorkspace } from '../../image-workspaces';
import type { ImageWorkspaceEntry } from '../../image-workspaces';
import type { PreparedScenarioAssetEntry, ScenarioStepEditorDocumentEntry } from '../contracts';
import { commitScenarioAggregateMutation } from '../aggregate-mutations';
import { rejectScenarioMutationBeforeHandoff } from '../asset-staging';
import { createScenarioAssetEntryFromBlob } from './capture-step/asset-entry';

const videoFrameImportSchema = z
  .object({
    kind: z.literal('video-frame'),
    blob: z.instanceof(Blob),
    source: z
      .object({
        kind: z.literal('video-frame'),
        recordingId: z.string().min(1).max(GUIDE_LIMITS.maxIdLength).nullable(),
        filename: z.string().max(GUIDE_LIMITS.maxLabelLength),
        timeSeconds: z.number().finite().min(0),
      })
      .strict(),
    title: z.string().max(GUIDE_LIMITS.maxLabelLength),
    description: z.string().max(GUIDE_LIMITS.maxTextLength),
  })
  .strict();

/** Only explicit local selections can enter a guide; library identity is re-read on import. */
export type GuideImageImportSource =
  | { kind: 'file'; file: File }
  | { kind: 'library'; mediaId: string }
  | z.infer<typeof videoFrameImportSchema>;
export type GuideImageImportPlacement =
  | { kind: 'steps' }
  | { kind: 'blocks'; stepId: string }
  | { kind: 'replace-image'; stepId: string; blockId: string };

/** Owns an ordered image batch through preparation and atomic publication, including compensation. */
export async function importScenarioImages(args: {
  project: GuideProject;
  baseUpdatedAt: number;
  sources: readonly GuideImageImportSource[];
  placement: GuideImageImportPlacement;
  signal: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}): Promise<GuideProject> {
  const { project, target, replacement } = admitImageImport(args);
  const assets: PreparedScenarioAssetEntry[] = [];
  const documents: ScenarioStepEditorDocumentEntry[] = [];
  const releases: Array<() => void> = [];
  let handedOff = false;
  try {
    for (const source of args.sources) {
      args.signal.throwIfAborted();
      const input = await readImportSource(source);
      if (input.workspace?.releaseDocumentAssets)
        releases.push(input.workspace.releaseDocumentAssets);
      args.signal.throwIfAborted();
      await assertImportableProjectImage(input.blob);
      const { assetEntry } = await createScenarioAssetEntryFromBlob({
        blob: input.blob,
        projectId: project.id,
        galleryAssetId: input.mediaId,
      });
      assets.push(assetEntry);
      args.signal.throwIfAborted();
      const documentId = input.workspace ? crypto.randomUUID() : null;
      if (input.workspace && documentId)
        documents.push({
          projectId: project.id,
          stepId: documentId,
          document: input.workspace.document,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      const block = createGuideImageBlock({
        id: crypto.randomUUID(),
        assetId: assetEntry.id,
        width: assetEntry.width,
        height: assetEntry.height,
        galleryAssetId: input.mediaId,
        editDocumentId: documentId,
        source: input.source ?? {
          kind: 'import',
          filename: input.name.slice(0, GUIDE_LIMITS.maxLabelLength),
        },
      });
      if (target?.kind === 'step' && replacement)
        target.blocks = target.blocks.map((current) =>
          current.id === replacement.id
            ? {
                ...block,
                id: replacement.id,
                ...(replacement.width ? { width: replacement.width } : {}),
                frame: replacement.frame,
                fit: replacement.fit,
                caption: replacement.caption,
                alt: replacement.alt,
              }
            : current
        );
      else if (target?.kind === 'step') target.blocks.push(block);
      else {
        const step = createGuideStep(input.name.slice(0, GUIDE_LIMITS.maxLabelLength));
        if (input.description)
          step.blocks.push({
            kind: 'text',
            id: crypto.randomUUID(),
            paragraphs: createGuideParagraphs(input.description),
          });
        step.blocks.push(block);
        project.items.push(step);
      }
      args.onProgress?.(assets.length, args.sources.length);
    }
    args.signal.throwIfAborted();
    handedOff = true;
    const result = await commitScenarioAggregateMutation(project, {
      expectedUpdatedAt: args.baseUpdatedAt,
      children: { assetPuts: assets, editorDocumentPuts: documents },
    });
    publishMediaHubLibraryChanged('update', [`scenario:${project.id}`]);
    return result.project;
  } catch (error) {
    if (!handedOff) return rejectScenarioMutationBeforeHandoff({ assetPuts: assets }, error);
    throw error;
  } finally {
    releases.forEach((release) => release());
  }
}

async function readImportSource(source: GuideImageImportSource): Promise<{
  blob: Blob;
  name: string;
  mediaId: string | null;
  workspace?: ImageWorkspaceEntry;
  source?: GuideImageSource;
  description?: string;
}> {
  if (source.kind === 'file') return { blob: source.file, name: source.file.name, mediaId: null };
  if (source.kind === 'video-frame') {
    const frame = videoFrameImportSchema.parse(source);
    return {
      blob: frame.blob,
      name: frame.title,
      mediaId: null,
      source: frame.source,
      description: frame.description,
    };
  }
  const entry = await getMediaLibraryEntry(source.mediaId);
  if (
    !entry ||
    (entry.kind !== 'image' && entry.kind !== 'screenshot') ||
    entry.source.kind === 'web-snapshot'
  ) {
    throw new Error('The selected library image is unavailable.');
  }
  const presentation = await getAggregatePresentation({ id: entry.id, kind: 'image' });
  if (
    !presentation?.previewBlob ||
    presentation.presentationRevision !== (entry.workspaceRevision ?? 0)
  ) {
    throw new Error('The library image preview is unavailable.');
  }
  const workspace = await recoverAndGetImageWorkspace(entry.id);
  if (
    (workspace && workspace.revision !== (entry.workspaceRevision ?? 0)) ||
    (!workspace && (entry.workspaceRevision ?? 0) > 0)
  ) {
    workspace?.releaseDocumentAssets?.();
    throw new Error('The library image changed during import.');
  }
  return {
    blob: presentation.previewBlob,
    name: entry.filename,
    mediaId: entry.id,
    ...(workspace ? { workspace } : {}),
  };
}

/** Validates detached content and placement capacity before any resource is acquired. */
function admitImageImport(args: Parameters<typeof importScenarioImages>[0]) {
  const parsed = parseGuideProject(args.project);
  if (parsed.status !== 'ok' || args.sources.length === 0 || args.sources.length > 50) {
    throw new Error('Invalid image import.');
  }
  for (const source of args.sources)
    if (source.kind === 'video-frame') videoFrameImportSchema.parse(source);
  const project = parsed.project;
  const placement = args.placement;
  const target =
    placement.kind !== 'steps'
      ? project.items.find((item) => item.id === placement.stepId)
      : undefined;
  if (placement.kind !== 'steps' && target?.kind !== 'step') {
    throw new Error('The selected step is unavailable.');
  }
  const replacement =
    placement.kind === 'replace-image' && target?.kind === 'step'
      ? target.blocks.find((block) => block.id === placement.blockId)
      : undefined;
  if (
    placement.kind === 'replace-image' &&
    (args.sources.length !== 1 ||
      (replacement?.kind !== 'image' && replacement?.kind !== 'image-slot'))
  )
    throw new Error('The selected image is unavailable.');
  if (
    (target?.kind === 'step' &&
      !replacement &&
      target.blocks.length + args.sources.length > GUIDE_LIMITS.maxBlocksPerStep) ||
    (!target && project.items.length + args.sources.length > GUIDE_LIMITS.maxItems)
  ) {
    throw new Error('The guide has reached its content limit.');
  }
  return {
    project,
    target,
    replacement:
      replacement?.kind === 'image' || replacement?.kind === 'image-slot' ? replacement : undefined,
  };
}
