import { VIDEO_EFFECT_BUNDLES_STORE } from '../../storage/constants';
import { getStore } from '../../storage';
import type { PreparedEffectBundle } from './prepare-effect-bundles';

type BackupTransaction = Parameters<typeof getStore>[0];

export async function restorePreparedEffectBundlesInTransaction(
  tx: BackupTransaction,
  preparedBundles: PreparedEffectBundle[]
): Promise<number> {
  for (const prepared of preparedBundles) {
    if (!prepared.restoredEntry) {
      throw new Error('EffectV1 catalog restore preflight is incomplete.');
    }
    await getStore(tx, VIDEO_EFFECT_BUNDLES_STORE).put(prepared.restoredEntry);
  }
  return preparedBundles.length;
}
