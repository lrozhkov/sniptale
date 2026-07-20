import { VIDEO_EFFECT_BUNDLES_STORE } from '../../../composition/persistence/infrastructure/indexed-db/core';
import { parseEffectBundleCatalogEntry } from '../../../composition/persistence/effect-bundles/entry';
import { assertEffectBundleCatalogIntegrity } from '../../../composition/persistence/effect-bundles/integrity';
import type { EffectBundleBackupDescriptor } from '../contracts/types';
import { safeBackupPathSegment } from '../metadata/path-segments';
import { createBackupBlobDescriptor } from './blob/descriptor';
import type { BackupExportBudget, BackupZipWriter } from './blob/budget';
import { assertBackupExportNotCancelled } from './blob/budget';

interface EffectBundleExportReader {
  getAll(storeName: typeof VIDEO_EFFECT_BUNDLES_STORE): Promise<unknown>;
}

export async function buildEffectBundleDescriptors(args: {
  budget: BackupExportBudget;
  db: EffectBundleExportReader;
  signal?: AbortSignal | undefined;
  zip: BackupZipWriter;
}): Promise<EffectBundleBackupDescriptor[]> {
  const values: unknown = await args.db.getAll(VIDEO_EFFECT_BUNDLES_STORE);
  if (!Array.isArray(values)) throw new Error('EffectV1 catalog backup source is invalid.');
  const descriptors: EffectBundleBackupDescriptor[] = [];
  for (const value of values) {
    assertBackupExportNotCancelled(args.signal);
    const entry = parseEffectBundleCatalogEntry(value);
    if (!entry) throw new Error('EffectV1 catalog backup source is invalid.');
    await assertEffectBundleCatalogIntegrity(entry);
    const segment = safeBackupPathSegment(entry.packId, 'effect bundle id');
    const { assets, ...entryWithoutAssets } = entry;
    descriptors.push({
      assets: assets.map((asset, index) =>
        createBackupBlobDescriptor(
          args.zip,
          args.budget,
          `effect-bundles/${segment}/assets/${index}-${asset.sha256}`,
          asset,
          args.signal
        )
      ),
      entry: entryWithoutAssets,
    });
  }
  return descriptors;
}
