import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { PreparedScenarioAssetEntry, ScenarioStepEditorDocumentEntry } from '../../contracts';
import { getScenarioAsset } from '../../projects/assets';
import { getScenarioStepEditorDocumentForTransfer } from '../../editor-documents';
import { commitScenarioAggregateMutation } from '../../aggregate-mutations';
import { rejectScenarioMutationBeforeHandoff } from '../../asset-staging';
import { createScenarioAssetEntryFromBlob } from '../capture-step/asset-entry';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';

/** Copies an edit buffer and its referenced children into one independently owned local project. */
export async function duplicateScenarioProjectRecord(
  source: GuideProject,
  name: string
): Promise<GuideProject> {
  const now = Date.now();
  const parsed = parseGuideProject({ ...source, name });
  if (parsed.status !== 'ok') throw new Error('Invalid guide copy.');
  const project: GuideProject = {
    ...parsed.project,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const assets: PreparedScenarioAssetEntry[] = [];
  const documents: ScenarioStepEditorDocumentEntry[] = [];
  const children = createCopyChildren(source.id, project, assets, documents);
  let handedOff = false;
  try {
    await remapCopyReferences(project, children);
    handedOff = true;
    const result = await commitScenarioAggregateMutation(project, {
      expectedUpdatedAt: null,
      storageClass: 'library',
      children: { assetPuts: assets, editorDocumentPuts: documents },
    });
    publishMediaHubLibraryChanged('create', [`scenario:${result.project.id}`]);
    return result.project;
  } catch (error) {
    if (!handedOff) return rejectScenarioMutationBeforeHandoff({ assetPuts: assets }, error);
    throw error;
  }
}

/** Owns deduplication and staging of the children referenced by one detached guide copy. */
function createCopyChildren(
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
      const prepared = await createScenarioAssetEntryFromBlob({
        blob,
        projectId: project.id,
        galleryAssetId: original.galleryAssetId,
      });
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

async function remapCopyReferences(
  project: GuideProject,
  children: ReturnType<typeof createCopyChildren>
): Promise<void> {
  for (const item of project.items) {
    item.id = crypto.randomUUID();
    if (item.kind !== 'step') continue;
    for (const block of item.blocks) {
      block.id = crypto.randomUUID();
      if (block.kind !== 'image') continue;
      block.assetId = await children.copyAsset(block.assetId);
      if (block.editDocumentId) {
        block.editDocumentId = await children.copyDocument(block.editDocumentId);
      }
    }
  }
}
