// policyStateId: surface-style-preset-mutation-queue - sync storage remains authoritative;
// this disposable queue only orders mutations inside one runtime.
import type { SurfaceStylePreset } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { browserStorage } from '../infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import {
  addUserSurfaceStylePreset,
  cloneSurfaceStylePresetCatalog,
  deleteUserSurfaceStylePreset,
  reorderUserSurfaceStylePresets,
  toggleSurfaceStylePresetFavorite as toggleFavorite,
  updateUserSurfaceStylePreset,
} from './catalog';
import {
  SURFACE_STYLE_PRESET_STORAGE_KEY,
  type SurfaceStylePresetCatalog,
  type SurfaceStylePresetMutationOutcome,
} from './contracts';
import { parseStoredSurfaceStylePresetState } from './parser';
import {
  readSurfaceStylePresetCatalog,
  SurfaceStylePresetQuotaError,
  writeSurfaceStylePresetCatalog,
} from './storage';

export * from './contracts';

let snapshot: SurfaceStylePresetCatalog | null = null;
let queue: Promise<void> = Promise.resolve();
const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
  const run = queue.catch(() => undefined).then(operation);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};
const cache = (catalog: SurfaceStylePresetCatalog) => {
  snapshot = cloneSurfaceStylePresetCatalog(catalog);
  return cloneSurfaceStylePresetCatalog(snapshot);
};

export async function loadSurfaceStylePresetCatalog() {
  return cache((await readSurfaceStylePresetCatalog()).catalog);
}

export function subscribeToSurfaceStylePresetCatalog(
  listener: (catalog: SurfaceStylePresetCatalog) => void
) {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, area) => {
    if (area !== 'sync' || !(SURFACE_STYLE_PRESET_STORAGE_KEY in changes)) return;
    const next = parseStoredSurfaceStylePresetState(
      changes[SURFACE_STYLE_PRESET_STORAGE_KEY]?.newValue
    ).catalog;
    if (snapshot && !next.unsafeForWrite && next.catalogRevision < snapshot.catalogRevision) return;
    listener(cache(next));
  });
}

async function mutate(
  expectedRevision: number,
  operation: (catalog: SurfaceStylePresetCatalog) => SurfaceStylePresetCatalog | null,
  allowUnsafeReset = false
): Promise<SurfaceStylePresetMutationOutcome> {
  return enqueue(() =>
    runWithPersistenceDomainMutationLock('surface-style-presets', async (permit) => {
      const loaded = await readSurfaceStylePresetCatalog();
      if (loaded.catalog.catalogRevision !== expectedRevision)
        return { outcome: 'stale-revision', catalog: cache(loaded.catalog) };
      if (loaded.catalog.unsafeForWrite && !allowUnsafeReset)
        return { outcome: 'unsafe-storage', catalog: cache(loaded.catalog) };
      const source = allowUnsafeReset
        ? parseStoredSurfaceStylePresetState(undefined).catalog
        : loaded.catalog;
      const next = operation(cloneSurfaceStylePresetCatalog(source));
      if (!next) return { outcome: 'rejected', catalog: cache(loaded.catalog) };
      if (!allowUnsafeReset && JSON.stringify(next) === JSON.stringify(loaded.catalog))
        return { outcome: 'unchanged', catalog: cache(loaded.catalog) };
      next.catalogRevision = expectedRevision + 1;
      next.unsafeForWrite = false;
      try {
        await writeSurfaceStylePresetCatalog(next, permit);
      } catch (error) {
        return {
          outcome: error instanceof SurfaceStylePresetQuotaError ? 'quota' : 'write-failed',
          catalog: cache(loaded.catalog),
        };
      }
      return { outcome: 'applied', catalog: cache(next) };
    })
  );
}

export const addSurfaceStylePreset = (expectedRevision: number, preset: SurfaceStylePreset) =>
  mutate(expectedRevision, (catalog) => addUserSurfaceStylePreset(catalog, preset));
export const updateSurfaceStylePreset = (
  expectedRevision: number,
  id: string,
  style: SurfaceStylePreset['style']
) => mutate(expectedRevision, (catalog) => updateUserSurfaceStylePreset(catalog, id, { style }));
export const renameSurfaceStylePreset = (expectedRevision: number, id: string, name: string) =>
  mutate(expectedRevision, (catalog) => updateUserSurfaceStylePreset(catalog, id, { name }));
export const duplicateSurfaceStylePreset = (
  expectedRevision: number,
  sourceId: string,
  preset: SurfaceStylePreset
) =>
  mutate(expectedRevision, (catalog) => {
    const source = catalog.presets.find((item) => item.id === sourceId);
    return source
      ? addUserSurfaceStylePreset(catalog, { ...preset, origin: 'user', style: source.style })
      : null;
  });
export const deleteSurfaceStylePreset = (expectedRevision: number, id: string) =>
  mutate(expectedRevision, (catalog) => deleteUserSurfaceStylePreset(catalog, id));
export const reorderSurfaceStylePresets = (expectedRevision: number, ids: readonly string[]) =>
  mutate(expectedRevision, (catalog) => reorderUserSurfaceStylePresets(catalog, ids));
export const toggleSurfaceStylePresetFavorite = (expectedRevision: number, id: string) =>
  mutate(expectedRevision, (catalog) => toggleFavorite(catalog, id));
export const resetSurfaceStylePresetCatalog = (expectedRevision: number) =>
  mutate(expectedRevision, (catalog) => catalog, true);
