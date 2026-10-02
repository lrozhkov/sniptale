import type { VideoProject } from '../../../features/video/project/types';
import { videoSourceReferences } from '../media-library/dependencies';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseScenarioAssetEntry, parseScenarioProjectEntry } from '../scenario/read-guards';
import { parseProjectAssetEntry } from './read-guards';
import type { createProjectMutationStores } from './mutation-stores';

type Locator = {
  kind: 'library-asset' | 'recording' | 'project-asset' | 'scenario-asset' | 'scenario';
  id: string;
};
function locators(project: VideoProject | undefined): Locator[] {
  if (!project) return [];
  return [
    ...project.assets.flatMap((asset) => videoSourceReferences(asset.source)),
    ...(project.baseRecordingId
      ? [{ kind: 'recording' as const, id: project.baseRecordingId }]
      : []),
    ...(project.source.kind === 'recording'
      ? [{ kind: 'recording' as const, id: project.source.recordingId }]
      : []),
    ...(project.source.kind === 'scenario'
      ? [{ kind: 'scenario' as const, id: project.source.scenarioProjectId }]
      : []),
  ];
}
const key = (locator: Locator) => JSON.stringify([locator.kind, locator.id]);

/** Admit new links before the first write; unchanged legacy links stay editable. */
export async function assertNewProjectSources(
  candidate: VideoProject,
  previous: VideoProject | undefined,
  stores: Pick<
    ReturnType<typeof createProjectMutationStores>,
    | 'mediaLibraryStore'
    | 'projectAssetStore'
    | 'recordingStore'
    | 'scenarioAssetStore'
    | 'scenarioProjectStore'
  >
): Promise<void> {
  const seen = new Set(locators(previous).map(key));
  for (const locator of locators(candidate)) {
    if (seen.has(key(locator))) continue;
    seen.add(key(locator));
    let entry: { id: string } | null;
    switch (locator.kind) {
      case 'library-asset':
        entry = parseMediaLibraryEntry(await stores.mediaLibraryStore.get(locator.id));
        break;
      case 'recording':
        entry = parseRecordingEntry(await stores.recordingStore.get(locator.id));
        break;
      case 'scenario-asset':
        entry = parseScenarioAssetEntry(await stores.scenarioAssetStore.get(locator.id));
        break;
      case 'scenario':
        entry = parseScenarioProjectEntry(await stores.scenarioProjectStore.get(locator.id));
        break;
      case 'project-asset': {
        const asset = parseProjectAssetEntry(await stores.projectAssetStore.get(locator.id));
        if (asset?.originMediaId) {
          const origin = parseMediaLibraryEntry(
            await stores.mediaLibraryStore.get(asset.originMediaId)
          );
          if (!origin || origin.id !== asset.originMediaId)
            throw new Error('New video project source is unavailable.');
        }
        entry = asset;
        break;
      }
    }
    if (!entry || entry.id !== locator.id)
      throw new Error('New video project source is unavailable.');
  }
}
