import {
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  SCENARIO_ASSETS_STORE,
} from '../infrastructure/indexed-db/core';
import type { initDB } from '../infrastructure/indexed-db/core';
import { deleteAssetObject, discardPreparedAsset, parseAssetRef } from '../assets';
import { isRecord } from '../infrastructure/indexed-db/read-primitives';
import type { PreparedScenarioAssetEntry, ScenarioStepEditorDocumentEntry } from './contracts';
import { parseScenarioAssetEntry } from './read-guards';

export const SCENARIO_ASSET_PUBLICATION_DOMAIN = 'scenario-assets';
export const SCENARIO_ASSET_OWNER_KIND = 'scenario-asset';
export const SCENARIO_ASSET_ROLE = 'body';

export interface ScenarioAggregateChildMutation {
  assetDeletes?: readonly string[];
  assetPuts?: readonly PreparedScenarioAssetEntry[];
  editorDocumentDeletes?: readonly string[];
  editorDocumentPuts?: readonly ScenarioStepEditorDocumentEntry[];
}

export async function discardScenarioAggregateAssetPuts(
  children: ScenarioAggregateChildMutation | undefined
): Promise<void> {
  const results = await Promise.allSettled(
    (children?.assetPuts ?? []).map((asset) => discardPreparedAsset(asset.assetId))
  );
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to discard uncommitted scenario assets.');
  }
}

export async function rejectScenarioMutationBeforeHandoff(
  children: ScenarioAggregateChildMutation | undefined,
  error: unknown
): Promise<never> {
  try {
    await discardScenarioAggregateAssetPuts(children);
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      'Scenario mutation was rejected before publication and asset cleanup was incomplete.',
      { cause: error }
    );
  }
  throw error;
}

export async function discardSupersededScenarioAssetPuts(
  db: Awaited<ReturnType<typeof initDB>>,
  assetPuts: readonly PreparedScenarioAssetEntry[]
): Promise<boolean> {
  for (const prepared of assetPuts) {
    const stored = parseScenarioAssetEntry(await db.get(SCENARIO_ASSETS_STORE, prepared.id));
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, prepared.assetId));
    const owner: unknown = await db.get(ASSET_OWNERS_STORE, [
      SCENARIO_ASSET_OWNER_KIND,
      prepared.id,
      SCENARIO_ASSET_ROLE,
    ]);
    if (
      stored?.assetId === prepared.assetId ||
      ref?.assetId === prepared.assetId ||
      (isRecord(owner) && owner['assetId'] === prepared.assetId)
    ) {
      return false;
    }
  }
  await Promise.all(assetPuts.map((asset) => deleteAssetObject(asset.assetId)));
  return true;
}
