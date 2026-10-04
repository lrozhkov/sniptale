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
import { getMediaLibraryEntry } from '../../../media-library';
import { ASSET_REFS_STORE, initDB } from '../../../infrastructure/indexed-db/core';
import { parseAssetRef } from '../../../assets';
import { scenarioLibraryMediaId } from '../../library-publication';
import { createScenarioAssetId } from './helpers';
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
      const mediaId = original.borrowedMediaId ?? scenarioLibraryMediaId(original.id);
      const media = await getMediaLibraryEntry(mediaId);
      if (
        media &&
        (media.source.kind === 'stored-asset' ||
          media.source.kind === 'project-asset' ||
          media.source.kind === 'recording') &&
        (media.source.kind !== 'stored-asset' || media.source.assetId === original.assetId)
      ) {
        const db = await initDB();
        const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, original.assetId));
        if (ref && ref.size === original.size && ref.mimeType === original.mimeType) {
          const { file: _file, borrowedMediaId: _borrowedMediaId, ...originalEntry } = original;
          const canBorrow = media.workspaceRevision === 0 && media.imageContentState !== 'edited';
          const prepared: PreparedScenarioAssetEntry = {
            ...originalEntry,
            id: createScenarioAssetId(),
            projectId: project.id,
            galleryAssetId: canBorrow ? mediaId : null,
            borrowedMediaId: mediaId,
            ...(canBorrow ? {} : { independentLibraryIdentity: true as const }),
            assetRef: ref,
            createdAt: Date.now(),
          };
          assets.push(prepared);
          assetIds.set(id, prepared.id);
          return prepared.id;
        }
      }
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
    if (project.tour.backgroundMusic)
      project.tour.backgroundMusic.assetId = await children.copyAsset(
        project.tour.backgroundMusic.assetId
      );
    for (const resource of project.tour.audioResources)
      resource.assetId = await children.copyAsset(resource.assetId);
    for (const slide of project.tour.slides)
      for (const target of getTourNarrationTargets(slide))
        if (target.narration)
          target.narration.assetId = await children.copyAsset(target.narration.assetId);
  }
}
