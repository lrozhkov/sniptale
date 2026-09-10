import { getEffectBundle } from './index';
import { parseEffectBundleCatalogEntry } from './entry';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { VIDEO_EFFECT_BUNDLES_STORE } from '../infrastructure/indexed-db/core';
import type { EffectPresetPreferences } from '../../../features/video/project/effect-bundle/catalog/presets';

export async function saveEffectPresetPreferences(
  packId: string,
  documentId: string,
  sourceSha256: string,
  preferences: EffectPresetPreferences,
  expectedPreferences?: EffectPresetPreferences
) {
  const verified = await getEffectBundle(packId);
  if (
    !verified ||
    verified.documents.find((item) => item.id === documentId)?.sha256 !== sourceSha256
  )
    throw new Error('Effect catalog changed');
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(VIDEO_EFFECT_BUNDLES_STORE, 'readwrite');
    const store = tx.objectStore(VIDEO_EFFECT_BUNDLES_STORE);
    const current = parseEffectBundleCatalogEntry(await store.get(packId));
    if (!current || current.sourceSha256 !== verified.sourceSha256) {
      tx.abort();
      throw new Error('Effect catalog changed');
    }
    if (
      JSON.stringify(
        current.documents.find((item) => item.id === documentId)?.presetPreferences ?? {
          presets: [],
        }
      ) !== JSON.stringify(expectedPreferences ?? { presets: [] })
    ) {
      tx.abort();
      throw new Error('Effect presets changed');
    }
    const next = parseEffectBundleCatalogEntry({
      ...current,
      updatedAt: Date.now(),
      documents: current.documents.map((entry) =>
        entry.id === documentId ? { ...entry, presetPreferences: preferences } : entry
      ),
    });
    if (!next) {
      tx.abort();
      throw new Error('Invalid effect presets');
    }
    await store.put(next);
    await tx.done;
    return next;
  });
}
