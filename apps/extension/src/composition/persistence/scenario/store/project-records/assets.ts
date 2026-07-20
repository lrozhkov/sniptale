import { deleteScenarioAsset, getScenarioAsset } from '../../projects';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import { mapScenarioAssetEntry } from './helpers';

/** Resolves the stored blob for a scenario-local asset. */
export async function getScenarioAssetBlob(assetId: string): Promise<Blob | undefined> {
  const entry = await getScenarioAsset(assetId);
  return entry?.blob;
}

/** Resolves metadata for a scenario-local asset. */
export async function getScenarioAssetEntry(
  assetId: string
): Promise<ScenarioAssetEntry | undefined> {
  const entry = await getScenarioAsset(assetId);
  return entry ? mapScenarioAssetEntry(entry) : undefined;
}

/** Deletes a scenario-local asset. */
export function deleteScenarioAssetRecord(assetId: string): Promise<void> {
  return deleteScenarioAsset(assetId);
}
