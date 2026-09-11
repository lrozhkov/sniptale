import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import type { EditorDocument } from '../../features/editor/document/types';
import { isEditorDocument } from '../../features/editor/document/guards';
import { rejectScenarioMutationBeforeHandoff } from '../../composition/persistence/scenario/asset-staging';
import { commitScenarioAggregateMutation } from '../../composition/persistence/scenario/aggregate-mutations';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';
import type { GuideImageEditTarget } from './source';
import type { GuideImageBlock } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type { PreparedScenarioAssetEntry } from '../../composition/persistence/scenario/contracts';
import { mapScenarioAssetEntry } from '../../composition/persistence/scenario/store/project-records/helpers';
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

/** Keeps the block layout and identity while accepting a new immutable edit version. */
export function buildScenarioEditedImageBlock(
  block: GuideImageBlock,
  assetId: string,
  editDocumentId: string
): GuideImageBlock {
  return { ...block, assetId, editDocumentId };
}

/** Applies one edited raster/document atomically while retaining previous versions for undo. */
export async function applyScenarioImageEdit(args: {
  project: GuideProject;
  baseUpdatedAt: number;
  target: GuideImageEditTarget;
  dataUrl: string;
  document: EditorDocument;
}): Promise<GuideProject> {
  const parsed = parseGuideProject(args.project);
  if (parsed.status !== 'ok' || !isImageDataUrl(args.dataUrl) || !isEditorDocument(args.document))
    throw new Error('Invalid image edit.');
  const project = parsed.project;
  const item = project.items.find((entry) => entry.id === args.target.itemId);
  const block =
    item?.kind === 'step' ? item.blocks.find((entry) => entry.id === args.target.blockId) : null;
  if (
    project.id !== args.target.projectId ||
    block?.kind !== 'image' ||
    block.assetId !== args.target.assetId ||
    block.editDocumentId !== args.target.editDocumentId
  ) {
    throw new Error('The edited image target has changed.');
  }
  const prepared = await prepareScenarioEditedCaptureAsset({
    dataUrl: args.dataUrl,
    projectId: project.id,
    galleryAssetId: block.galleryAssetId,
  });
  let handedOff = false;
  try {
    const documentId = crypto.randomUUID();
    const replacement = buildScenarioEditedImageBlock(block, prepared.asset.id, documentId);
    if (item?.kind === 'step')
      item.blocks = item.blocks.map((entry) => (entry.id === block.id ? replacement : entry));
    handedOff = true;
    const result = await commitScenarioAggregateMutation(project, {
      expectedUpdatedAt: args.baseUpdatedAt,
      children: {
        assetPuts: [prepared.entry],
        editorDocumentPuts: [
          {
            projectId: project.id,
            stepId: documentId,
            document: args.document,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      },
    });
    publishMediaHubLibraryChanged('update', [`scenario:${project.id}`]);
    return result.project;
  } catch (error) {
    if (!handedOff)
      return rejectScenarioMutationBeforeHandoff({ assetPuts: [prepared.entry] }, error);
    throw error;
  }
}
