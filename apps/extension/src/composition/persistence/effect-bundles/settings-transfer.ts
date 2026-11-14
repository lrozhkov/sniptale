import { z } from 'zod';
import type { AnimationCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { VisualCatalogPreference } from '../../../features/video/project/effect-bundle/catalog/presets';
import { parseAnimationCatalogEntry, parseStoredAnimationCatalogEntry } from './entry';
import { assertAnimationCatalogIntegrity } from './integrity';
import {
  parseGlPresetCatalogEntry,
  resolveGlPresetCatalogEntry,
  GL_PRESET_CATALOG_MAX_BYTES,
  GL_PRESET_CATALOG_MAX_ENTRIES,
  type GlPresetCatalogEntry,
} from './gl-presets';
import { admitVisualCatalogPreferences } from './preferences';
import {
  initDB,
  VIDEO_ANIMATION_PACKAGES_STORE,
  VIDEO_GL_TRANSITION_PRESETS_STORE,
  VIDEO_VISUAL_PREFERENCES_STORE,
} from '../infrastructure/indexed-db/core';
import {
  isActivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';

/** Transfer immutable sources separately from effective catalogue availability and user preferences. */
export async function encodeEffectSettingsEntry(entry: AnimationCatalogEntry) {
  await assertAnimationCatalogIntegrity(entry);
  return { ...structuredClone(entry), id: entry.packId, name: entry.label.en };
}
export function decodeEffectSettingsEntry(value: unknown): AnimationCatalogEntry {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['name'] !== 'string')
    throw new Error('Invalid animation settings entry');
  const { id, name: _name, ...resource } = value;
  // The transfer planner owns a copy identity; retained document sources remain unchanged.
  const entry = parseAnimationCatalogEntry({ ...resource, packId: id });
  if (!entry) throw new Error('Invalid animation settings catalog');
  return entry;
}
export function encodeGlPresetSettingsEntry(entry: GlPresetCatalogEntry) {
  return { ...entry, name: resolveGlPresetCatalogEntry(entry, []).name };
}
export function decodeGlPresetSettingsEntry(value: unknown): GlPresetCatalogEntry {
  if (!isRecord(value) || typeof value['name'] !== 'string')
    throw new Error('Invalid GL settings entry');
  const { name: _name, ...resource } = value;
  const entry = parseGlPresetCatalogEntry(resource);
  if (!entry) throw new Error('Invalid GL settings catalog');
  return entry;
}
export function parseVisualSettingsPreferences(
  value: unknown,
  kind: VisualCatalogPreference['kind']
) {
  const preferences = admitVisualCatalogPreferences(value);
  if (preferences.some((row) => row.kind !== kind))
    throw new Error('Visual preference kind does not match its settings field');
  return preferences;
}
const collection = z.strictObject({
  items: z.array(z.unknown()).optional(),
  preferences: z.array(z.unknown()).optional(),
  transitionItems: z.array(z.unknown()).optional(),
  transitionPreferences: z.array(z.unknown()).optional(),
});
function assertPermit(
  permit: PersistenceMutationPermit | undefined
): asserts permit is PersistenceMutationPermit {
  if (!isActivePersistenceMutationPermit(permit)) throw new Error('Invalid persistence permit');
}
function keyOf(value: unknown, field: 'id' | 'packId'): string {
  if (!isRecord(value) || typeof value[field] !== 'string')
    throw new Error('Invalid visual resource identity');
  return value[field];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The caller holds its exclusive settings workflow permit through preparation, commit and compensation. */
export async function prepareEffectSettingsMutation(
  value: unknown,
  permit?: PersistenceMutationPermit
) {
  assertPermit(permit);
  const input = collection.parse(value),
    entries = input.items?.map(decodeEffectSettingsEntry);
  if (entries) {
    if (
      new Set(entries.map((entry) => entry.packId)).size !== entries.length ||
      entries.reduce((sum, entry) => sum + entry.retainedByteLength, 0) > 512 * 1024 * 1024
    )
      throw new Error('Invalid animation settings inventory');
    for (const entry of entries) await assertAnimationCatalogIntegrity(entry);
  }
  const glEntries = input.transitionItems?.map(decodeGlPresetSettingsEntry);
  if (
    glEntries &&
    (glEntries.length > GL_PRESET_CATALOG_MAX_ENTRIES ||
      new Set(glEntries.map((entry) => entry.id)).size !== glEntries.length ||
      glEntries.reduce((sum, entry) => sum + entry.retainedByteLength, 0) >
        GL_PRESET_CATALOG_MAX_BYTES)
  )
    throw new Error('Invalid GL settings inventory');
  const animationPreferences =
    input.preferences && parseVisualSettingsPreferences(input.preferences, 'animation');
  const transitionPreferences =
    input.transitionPreferences &&
    parseVisualSettingsPreferences(input.transitionPreferences, 'transition');
  const db = await initDB(permit);
  const beforeEntries: unknown[] | undefined =
    entries && (await db.getAll(VIDEO_ANIMATION_PACKAGES_STORE));
  const beforeGlEntries: unknown[] | undefined =
    glEntries && (await db.getAll(VIDEO_GL_TRANSITION_PRESETS_STORE));
  const beforePreferences =
    animationPreferences || transitionPreferences
      ? admitVisualCatalogPreferences(await db.getAll(VIDEO_VISUAL_PREFERENCES_STORE))
      : undefined;
  if (beforeEntries)
    for (const value of beforeEntries) {
      const entry = parseStoredAnimationCatalogEntry(value);
      if (!entry) throw new Error('Invalid retained animation settings catalog');
      await assertAnimationCatalogIntegrity(entry);
    }
  if (beforeGlEntries && beforeGlEntries.some((value) => !parseGlPresetCatalogEntry(value)))
    throw new Error('Invalid retained GL settings catalog');
  const preferences =
    beforePreferences &&
    admitVisualCatalogPreferences([
      ...beforePreferences.filter((row) =>
        row.kind === 'animation' ? !animationPreferences : !transitionPreferences
      ),
      ...(animationPreferences ?? []),
      ...(transitionPreferences ?? []),
    ]);
  const stores = [
    ...(entries ? [VIDEO_ANIMATION_PACKAGES_STORE] : []),
    ...(glEntries ? [VIDEO_GL_TRANSITION_PRESETS_STORE] : []),
    ...(preferences ? [VIDEO_VISUAL_PREFERENCES_STORE] : []),
  ];
  async function write(resources: {
    animations?: readonly unknown[] | undefined;
    gl?: readonly unknown[] | undefined;
    preferences?: VisualCatalogPreference[] | undefined;
  }) {
    assertPermit(permit);
    if (!stores.length) return;
    const tx = db.transaction(stores, 'readwrite');
    try {
      for (const [storeName, field, values] of [
        [VIDEO_ANIMATION_PACKAGES_STORE, 'packId', resources.animations],
        [VIDEO_GL_TRANSITION_PRESETS_STORE, 'id', resources.gl],
      ] as const) {
        if (!values) continue;
        const store = tx.objectStore(storeName),
          current: unknown[] = await store.getAll();
        const keys = new Set(values.map((value) => keyOf(value, field)));
        assertPermit(permit);
        for (const value of current)
          if (!keys.has(keyOf(value, field))) {
            assertPermit(permit);
            await store.delete(keyOf(value, field));
          }
        for (const value of values) {
          const previous = current.find((item) => keyOf(item, field) === keyOf(value, field));
          if (JSON.stringify(previous) !== JSON.stringify(value)) {
            assertPermit(permit);
            await store.put(value);
          }
        }
      }
      if (resources.preferences) {
        const store = tx.objectStore(VIDEO_VISUAL_PREFERENCES_STORE),
          current = admitVisualCatalogPreferences(await store.getAll());
        assertPermit(permit);
        for (const row of current)
          if (
            !resources.preferences.some(
              (next) => next.kind === row.kind && next.packId === row.packId
            )
          ) {
            assertPermit(permit);
            await store.delete([row.kind, row.packId]);
          }
        for (const row of resources.preferences) {
          const previous = current.find(
            (item) => item.kind === row.kind && item.packId === row.packId
          );
          if (JSON.stringify(previous) !== JSON.stringify(row)) {
            assertPermit(permit);
            await store.put(row);
          }
        }
      }
      assertPermit(permit);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* A failed native request can already have aborted it. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  }
  return {
    commit: () => write({ animations: entries, gl: glEntries, preferences }),
    rollback: () =>
      write({ animations: beforeEntries, gl: beforeGlEntries, preferences: beforePreferences }),
  };
}
