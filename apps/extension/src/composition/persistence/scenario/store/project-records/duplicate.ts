import { createCopyChildren, remapCopyReferences } from './copy-children';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { PreparedScenarioAssetEntry, ScenarioStepEditorDocumentEntry } from '../../contracts';
import { commitScenarioAggregateMutation } from '../../aggregate-mutations';
import { rejectScenarioMutationBeforeHandoff } from '../../asset-staging';
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
