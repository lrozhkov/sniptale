// policyStateId: gradient-preset-mutation-queue - durable sync storage remains authoritative;
// this disposable queue only preserves mutation order within one runtime.
import type { Gradient } from '@sniptale/foundation/paint';
import { browserStorage } from '../infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import { createStorageWriteQueue } from '../infrastructure/write-queue';
import {
  GRADIENT_PRESET_STORAGE_KEY,
  type GradientPresetCatalog,
  type GradientPresetMutationOutcome,
  type GradientPresetSurface,
  type NewGradientPreset,
} from './contracts';
import { cloneGradientPresetCatalog } from './defaults';
import {
  addUserGradientPreset,
  deleteUserGradientPreset,
  reorderGradientPresets,
  toggleGradientPresetFavorite,
  updateGradientPresetValues,
  toggleGradientPresetEnabled as toggleEnabled,
  setDefaultGradientPreset as setDefault,
  resetSystemGradientPreset as resetSystem,
} from './mutations';
import { parseGradientPresetCatalog } from './parser';
import { readGradientPresetCatalog, writeGradientPresetCatalog } from './storage';

export * from './contracts';
let snapshot: GradientPresetCatalog | null = null;
const enqueue = createStorageWriteQueue();
const cache = (catalog: GradientPresetCatalog) => (
  (snapshot = cloneGradientPresetCatalog(catalog)),
  cloneGradientPresetCatalog(snapshot)
);

export async function loadGradientPresetCatalog(): Promise<GradientPresetCatalog> {
  return cache((await readGradientPresetCatalog()).catalog);
}
export function subscribeToGradientPresetCatalog(
  listener: (catalog: GradientPresetCatalog) => void
): () => void {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, area) => {
    if (area === 'sync' && GRADIENT_PRESET_STORAGE_KEY in changes)
      listener(
        cache(parseGradientPresetCatalog(changes[GRADIENT_PRESET_STORAGE_KEY]?.newValue).catalog)
      );
  });
}
async function mutate(
  operation: (catalog: GradientPresetCatalog) => GradientPresetCatalog | null
): Promise<GradientPresetMutationOutcome> {
  return enqueue(() =>
    runWithPersistenceDomainMutationLock('gradient-presets', async (permit) => {
      const loaded = await readGradientPresetCatalog();
      if (loaded.unsafeForWrite) return 'rejected';
      const next = operation(cloneGradientPresetCatalog(loaded.catalog));
      if (!next) return 'rejected';
      if (JSON.stringify(next) === JSON.stringify(cloneGradientPresetCatalog(loaded.catalog)))
        return 'unchanged';
      await writeGradientPresetCatalog(next, permit);
      cache(next);
      return 'applied';
    })
  );
}
export const addGradientPreset = (preset: NewGradientPreset) =>
  mutate((catalog) => addUserGradientPreset(catalog, preset));
export const updateGradientPreset = (id: string, gradient: Gradient, name?: string) =>
  mutate((catalog) => updateGradientPresetValues(catalog, id, gradient, name));
export const renameGradientPreset = (id: string, name: string) =>
  mutate((catalog) => {
    const preset = catalog.presets.find((item) => item.id === id);
    return preset ? updateGradientPresetValues(catalog, id, preset.gradient, name) : null;
  });
export const duplicateGradientPreset = (sourceId: string, preset: NewGradientPreset) =>
  mutate((catalog) => {
    const source = catalog.presets.find((item) => item.id === sourceId);
    return source
      ? addUserGradientPreset(catalog, { ...preset, origin: 'user', gradient: source.gradient })
      : null;
  });
export const deleteGradientPreset = (id: string) =>
  mutate((catalog) => deleteUserGradientPreset(catalog, id));
export const reorderGradientPresetCatalog = (ids: readonly string[]) =>
  mutate((catalog) => reorderGradientPresets(catalog, ids));
export const toggleGradientPresetEnabled = (id: string) =>
  mutate((catalog) => toggleEnabled(catalog, id));
export const setDefaultGradientPresetForSurface = (surface: GradientPresetSurface, id: string) =>
  mutate((catalog) => setDefault(catalog, surface, id));
export const resetGradientPreset = (id: string) => mutate((catalog) => resetSystem(catalog, id));
export const toggleGradientPresetFavoriteForSurface = (
  surface: GradientPresetSurface,
  id: string
) => mutate((catalog) => toggleGradientPresetFavorite(catalog, surface, id));
