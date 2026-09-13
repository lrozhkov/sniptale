import {
  getTourImages,
  getTourAudioResources,
  getTourNarrationTargets,
  remapTourIdentities,
} from '../../../../../features/scenario/project/public';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { PreparedScenarioAssetEntry, ScenarioStepEditorDocumentEntry } from '../../contracts';
import { getScenarioAsset } from '../../projects/assets';
import { getScenarioStepEditorDocumentForTransfer } from '../../editor-documents';
import {
  createScenarioAssetEntryFromBlob,
  createScenarioAudioAssetEntry,
} from '../capture-step/asset-entry';

/** Owns deduplication and staging of the children referenced by one detached guide copy. */
export function createCopyChildren(
  sourceId: string,
  project: GuideProject,
  assets: PreparedScenarioAssetEntry[],
  documents: ScenarioStepEditorDocumentEntry[]
) {
  const assetIds = new Map<string, string>();
  const documentIds = new Map<string, string>();
  return {
    async copyAsset(id: string): Promise<string> {
      const existing = assetIds.get(id);
      if (existing) return existing;
      const original = await getScenarioAsset(id);
      if (!original || original.projectId !== sourceId)
        throw new Error('A guide image is missing or belongs to another project.');
      const blob = original.file.type
        ? original.file
        : original.file.slice(0, original.file.size, original.mimeType);
      const input = { blob, projectId: project.id, galleryAssetId: original.galleryAssetId };
      const prepared =
        original.duration === undefined
          ? await createScenarioAssetEntryFromBlob(input)
          : await createScenarioAudioAssetEntry({ ...input, duration: original.duration });
      assets.push(prepared.assetEntry);
      assetIds.set(id, prepared.assetEntry.id);
      return prepared.assetEntry.id;
    },
    async copyDocument(id: string): Promise<string> {
      const existing = documentIds.get(id);
      if (existing) return existing;
      const original = await getScenarioStepEditorDocumentForTransfer(id);
      if (!original || original.projectId !== sourceId)
        throw new Error('A guide annotation document is missing or belongs to another project.');
      const documentId = crypto.randomUUID();
      documentIds.set(id, documentId);
      documents.push({
        stepId: documentId,
        projectId: project.id,
        document: original.document,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
      return documentId;
    },
  };
}

export async function remapCopyReferences(
  project: GuideProject,
  children: ReturnType<typeof createCopyChildren>
): Promise<void> {
  const guideIds = new Map<string, string>();
  const nextId = (old: string) => {
    const id = crypto.randomUUID();
    guideIds.set(old, id);
    return id;
  };
  for (const item of project.items) {
    item.id = nextId(item.id);
    if (item.kind !== 'step') continue;
    for (const block of item.blocks) {
      block.id = nextId(block.id);
      if (block.kind !== 'image') continue;
      block.assetId = await children.copyAsset(block.assetId);
      if (block.editDocumentId) {
        block.editDocumentId = await children.copyDocument(block.editDocumentId);
      }
    }
  }
  if (project.tour) {
    remapTourIdentities(project.tour, () => crypto.randomUUID(), guideIds);
    for (const image of getTourImages(project.tour)) {
      image.assetId = await children.copyAsset(image.assetId);
      if (image.editDocumentId)
        image.editDocumentId = await children.copyDocument(image.editDocumentId);
    }
    project.tour.audioResources = getTourAudioResources(project.tour);
    for (const resource of project.tour.audioResources)
      resource.assetId = await children.copyAsset(resource.assetId);
    for (const slide of project.tour.slides)
      for (const target of getTourNarrationTargets(slide))
        if (target.narration)
          target.narration.assetId = await children.copyAsset(target.narration.assetId);
  }
}
