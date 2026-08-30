import { getProjectAsset } from '../../../composition/persistence/projects/index';
import { getRecording } from '../../../composition/persistence/recordings/index';
import { getScenarioAsset } from '../../../composition/persistence/scenario/projects';
import type { getAssetById } from '../../../features/video/project/timeline';

type BlobAssetSource = NonNullable<ReturnType<typeof getAssetById>>['source'];

export async function loadBlobForSource(source: BlobAssetSource): Promise<Blob> {
  if (source.kind === 'recording') {
    const entry = await getRecording(source.recordingId);
    if (!entry) {
      throw new Error(`Recording ${source.recordingId} not found.`);
    }
    return entry.file;
  }

  if (source.kind === 'scenario-asset') {
    const scenarioAsset = await getScenarioAsset(source.scenarioAssetId);
    if (!scenarioAsset) {
      throw new Error(`Scenario asset ${source.scenarioAssetId} not found.`);
    }
    return scenarioAsset.file;
  }

  const projectAsset = await getProjectAsset(source.projectAssetId);
  if (projectAsset.status === 'not-found') {
    throw new Error(`Project asset ${source.projectAssetId} not found.`);
  }
  if (projectAsset.status !== 'ready') {
    throw new Error(`Project asset ${source.projectAssetId} ${projectAsset.status}.`);
  }
  return projectAsset.entry.file;
}

export async function loadBlobForAsset(
  asset: NonNullable<ReturnType<typeof getAssetById>>
): Promise<Blob> {
  return loadBlobForSource(asset.source);
}
