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
    return entry.blob;
  }

  if (source.kind === 'scenario-asset') {
    const scenarioAsset = await getScenarioAsset(source.scenarioAssetId);
    if (!scenarioAsset) {
      throw new Error(`Scenario asset ${source.scenarioAssetId} not found.`);
    }
    return scenarioAsset.blob;
  }

  const projectAsset = await getProjectAsset(source.projectAssetId);
  if (!projectAsset) {
    throw new Error(`Project asset ${source.projectAssetId} not found.`);
  }
  return projectAsset.blob;
}

export async function loadBlobForAsset(
  asset: NonNullable<ReturnType<typeof getAssetById>>
): Promise<Blob> {
  return loadBlobForSource(asset.source);
}
