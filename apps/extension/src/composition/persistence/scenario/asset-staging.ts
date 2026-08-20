import { discardPreparedAsset } from '../assets';
import type {
  PreparedScenarioAssetEntry,
  ScenarioStepEditorDocumentEntry,
  StoredScenarioStepEditorDocumentEntry,
} from './contracts';
import type { AssetRef } from '../assets';

export const SCENARIO_ASSET_PUBLICATION_DOMAIN = 'scenario-assets';
export const SCENARIO_ASSET_OWNER_KIND = 'scenario-asset';
export const SCENARIO_ASSET_ROLE = 'body';

export interface ScenarioAggregateChildMutation {
  assetDeletes?: readonly string[];
  assetPuts?: readonly PreparedScenarioAssetEntry[];
  editorDocumentDeletes?: readonly string[];
  editorDocumentPuts?: readonly ScenarioStepEditorDocumentEntry[];
}

export interface PreparedScenarioStepEditorDocumentEntry extends StoredScenarioStepEditorDocumentEntry {
  assetRefs: AssetRef[];
}

export interface PreparedScenarioAggregateChildMutation extends Omit<
  ScenarioAggregateChildMutation,
  'editorDocumentPuts'
> {
  editorDocumentPuts?: readonly PreparedScenarioStepEditorDocumentEntry[];
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
  children: Pick<ScenarioAggregateChildMutation, 'assetPuts'> | undefined,
  error: unknown
): Promise<never> {
  let cleanupError: unknown;
  try {
    await discardScenarioAggregateAssetPuts(children);
  } catch (caughtError) {
    cleanupError = caughtError;
  }
  if (cleanupError !== undefined) {
    throw new AggregateError(
      [error, cleanupError],
      'Scenario mutation was rejected before publication and asset cleanup was incomplete.',
      { cause: error }
    );
  }
  throw error;
}
