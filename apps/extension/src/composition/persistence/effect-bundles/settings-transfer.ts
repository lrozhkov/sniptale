import {
  parseEffectCatalogPreferences,
  readEffectCatalogPreferences,
  writeEffectCatalogPreferences,
} from './preferences';
import { EFFECT_BUNDLE_LIMITS } from '../../../features/video/project/effect-bundle';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { parseEffectBundleCatalogEntry } from './entry';
import { assertEffectBundleCatalogIntegrity } from './integrity';
import { initDB, VIDEO_EFFECT_BUNDLES_STORE } from '../infrastructure/indexed-db/core';
import {
  isActivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';

type PortableEntry = Omit<EffectBundleCatalogEntry, 'assets'> & {
  id: string;
  name: string;
  assets: Array<Omit<EffectBundleCatalogEntry['assets'][number], 'blob'> & { base64: string }>;
};

export async function encodeEffectSettingsEntry(
  entry: EffectBundleCatalogEntry
): Promise<PortableEntry> {
  if (entry.source === 'builtin' || entry.materializeDocument)
    throw new Error('Builtin resources are not transferable');
  const assets = await Promise.all(
    entry.assets.map(async ({ blob, ...asset }) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return { ...asset, base64: btoa(binary) };
    })
  );
  return {
    ...entry,
    documents: entry.documents.map(({ presetPreferences: _preferences, ...document }) => document),
    id: entry.packId,
    name: entry.label.en,
    assets,
  };
}

export function decodeEffectSettingsEntry(value: unknown): EffectBundleCatalogEntry {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    !Array.isArray(value['assets']) ||
    value['assets'].length > EFFECT_BUNDLE_LIMITS.maxAssets ||
    value['assets'].reduce(
      (total: number, asset: unknown) =>
        total +
        (isRecord(asset) && typeof asset['base64'] === 'string' ? asset['base64'].length : 0),
      0
    ) >
      Math.ceil(EFFECT_BUNDLE_LIMITS.maxInflatedBytes / 3) * 4
  )
    throw new Error('Invalid effect settings entry');
  const assets = value['assets'].map((asset) => {
    if (
      !isRecord(asset) ||
      typeof asset['base64'] !== 'string' ||
      asset['base64'].length > Math.ceil(EFFECT_BUNDLE_LIMITS.maxEntryBytes / 3) * 4 ||
      !isBase64(asset['base64']) ||
      typeof asset['mimeType'] !== 'string'
    )
      throw new Error('Invalid effect settings asset');
    const bytes = Uint8Array.from(atob(asset['base64']), (char) => char.charCodeAt(0));
    return { ...asset, blob: new Blob([bytes], { type: asset['mimeType'] }) };
  });
  const entry = parseEffectBundleCatalogEntry({ ...value, packId: value['id'], assets });
  if (!entry) throw new Error('Invalid effect settings catalog');
  return entry;
}

/** Validate all assets before any settings writer commits. The caller owns cross-store rollback. */
export async function prepareEffectSettingsMutation(
  value: unknown,
  permit?: PersistenceMutationPermit
) {
  if (!isActivePersistenceMutationPermit(permit)) throw new Error('Invalid persistence permit');
  if (!isRecord(value) || !Array.isArray(value['items']))
    throw new Error('Invalid effect settings collection');
  const entries = value['items'].map(decodeEffectSettingsEntry);
  const preferences = parseEffectCatalogPreferences(value['preferences']);
  const beforePreferences = await readEffectCatalogPreferences();
  if (
    new Set(entries.map((entry) => entry.packId)).size !== entries.length ||
    entries.reduce((sum, entry) => sum + entry.retainedByteLength, 0) > 512 * 1024 * 1024
  )
    throw new Error('Invalid effect settings inventory');
  for (const entry of entries) await assertEffectBundleCatalogIntegrity(entry);
  const db = await initDB(permit);
  const before = await db.getAll(VIDEO_EFFECT_BUNDLES_STORE);
  const write = async (values: typeof before) => {
    if (!isActivePersistenceMutationPermit(permit)) throw new Error('Invalid persistence permit');
    const tx = db.transaction(VIDEO_EFFECT_BUNDLES_STORE, 'readwrite');
    try {
      await tx.store.clear();
      for (const entry of values) await tx.store.put(entry);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The failed transaction may already be aborted. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  };
  return {
    commit: async () => {
      await write(entries);
      await writeEffectCatalogPreferences(preferences, permit);
    },
    rollback: async () => {
      await write(before);
      await writeEffectCatalogPreferences(beforePreferences, permit);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  try {
    return btoa(atob(value)) === value;
  } catch {
    return false;
  }
}
