import { browserStorage } from '../infrastructure/browser-storage';
import {
  runWithPersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  parseStoredEffectPresetPreferences,
  type EffectPresetPreferences,
} from '../../../features/video/project/effect-bundle/catalog/presets';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';

export const EFFECT_PREFERENCES_KEY = 'videoEffectPreferences';
export interface EffectCatalogPreference {
  packId: string;
  enabled?: boolean;
  documentEnabled?: Record<string, boolean>;
  documents: Record<string, EffectPresetPreferences>;
}
export function parseEffectCatalogPreferences(value: unknown): EffectCatalogPreference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 256) throw new Error('Invalid effect preferences');
  if (JSON.stringify(value).length > 1024 * 1024)
    throw new Error('Effect preferences quota exceeded');
  const seen = new Set<string>();
  return value.map((row) => {
    if (
      !record(row) ||
      typeof row['packId'] !== 'string' ||
      !/^(builtin:)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(row['packId']) ||
      seen.has(row['packId']) ||
      !record(row['documents']) ||
      Object.keys(row['documents']).length > 128 ||
      (row['enabled'] !== undefined && typeof row['enabled'] !== 'boolean')
    )
      throw new Error('Invalid effect preference');
    const availability = row['documentEnabled'];
    if (
      availability !== undefined &&
      (!record(availability) ||
        Object.keys(availability).length > 128 ||
        Object.entries(availability).some(
          ([id, enabled]) =>
            !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || typeof enabled !== 'boolean'
        ))
    )
      throw new Error('Invalid effect availability');
    seen.add(row['packId']);
    const documents: Record<string, EffectPresetPreferences> = {};
    for (const [id, value] of Object.entries(row['documents'])) {
      const parsed = parseStoredEffectPresetPreferences(value);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || !parsed)
        throw new Error('Invalid effect preset');
      Object.defineProperty(documents, id, {
        value: parsed,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return {
      packId: row['packId'],
      documents,
      ...(record(availability)
        ? {
            documentEnabled: Object.fromEntries(
              Object.entries(availability).map(([id, enabled]) => [id, enabled === true])
            ),
          }
        : {}),
      ...(typeof row['enabled'] === 'boolean' ? { enabled: row['enabled'] } : {}),
    };
  });
}
export async function readEffectCatalogPreferences() {
  return parseEffectCatalogPreferences(
    (await browserStorage.local.get(EFFECT_PREFERENCES_KEY))[EFFECT_PREFERENCES_KEY]
  );
}
export async function writeEffectCatalogPreferences(
  value: EffectCatalogPreference[],
  permit?: PersistenceMutationPermit
) {
  await browserStorage.local.set(
    { [EFFECT_PREFERENCES_KEY]: parseEffectCatalogPreferences(value) },
    permit
  );
}
export async function mutateEffectCatalogPreference(
  packId: string,
  update: (current: EffectCatalogPreference) => EffectCatalogPreference
) {
  return runWithPersistenceMutationPermit((permit) =>
    navigator.locks.request('sniptale-effect-preferences', async () => {
      const current = await readEffectCatalogPreferences();
      const next = update(
        current.find((row) => row.packId === packId) ?? { packId, documents: {} }
      );
      await writeEffectCatalogPreferences(
        [...current.filter((row) => row.packId !== packId), next],
        permit
      );
    })
  );
}
export function overlayEffectPreferences(
  entry: EffectBundleCatalogEntry,
  preferences: EffectCatalogPreference[]
): EffectBundleCatalogEntry {
  const preference = preferences.find((row) => row.packId === entry.packId);
  const documents = entry.documents.map((document) => ({
    ...document,
    enabled:
      preference?.documentEnabled && Object.hasOwn(preference.documentEnabled, document.id)
        ? preference.documentEnabled[document.id]!
        : (preference?.enabled ?? entry.enabled),
    ...(preference && Object.hasOwn(preference.documents, document.id)
      ? { presetPreferences: preference.documents[document.id] }
      : {}),
  }));
  return { ...entry, documents, enabled: documents.some((document) => document.enabled) };
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Export a complete preference view, including preferences retained with an imported catalog. */
export function collectEffectCatalogPreferences(
  entries: readonly EffectBundleCatalogEntry[],
  preferences: EffectCatalogPreference[]
): EffectCatalogPreference[] {
  const result = new Map(preferences.map((preference) => [preference.packId, preference]));
  for (const entry of entries) {
    const current = result.get(entry.packId);
    const retained = Object.fromEntries(
      entry.documents.flatMap((document) =>
        document.presetPreferences ? [[document.id, document.presetPreferences]] : []
      )
    );
    result.set(entry.packId, {
      packId: entry.packId,
      enabled: current?.enabled ?? entry.enabled,
      documents: { ...retained, ...current?.documents },
      ...(current?.documentEnabled ? { documentEnabled: current.documentEnabled } : {}),
    });
  }
  return parseEffectCatalogPreferences([...result.values()]);
}
