import type { SurfaceStylePreset } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { cloneSurfaceStylePreset } from '../../../features/highlighter/surface-style/operations';
import {
  getSystemSurfaceStylePresets,
  SYSTEM_SURFACE_STYLE_CATALOG_REVISION,
} from '../../../features/highlighter/surface-style/system-presets';
import {
  areSurfaceStylesEqual,
  parseSurfaceStyle,
} from '../../../features/highlighter/surface-style/style';
import {
  SURFACE_STYLE_PRESET_MAX_USERS,
  type NewUserSurfaceStylePreset,
  type ManagedSurfaceStylePreset,
  type SurfaceStylePresetCatalog,
} from './contracts';

const normalizeName = (name: string) => {
  const normalized = name.trim();
  return normalized.length > 0 && normalized.length <= 80 ? normalized : null;
};

export function cloneSurfaceStylePresetCatalog(
  catalog: SurfaceStylePresetCatalog
): SurfaceStylePresetCatalog {
  return {
    ...catalog,
    favoriteIds: [...catalog.favoriteIds],
    presets: catalog.presets.map((preset) => ({
      ...cloneSurfaceStylePreset(preset),
      customized: preset.customized,
      enabled: preset.enabled,
      order: preset.order,
    })),
  };
}

export function createSurfaceStylePresetCatalog(args?: {
  catalogRevision?: number;
  defaultPresetId?: string;
  favoriteIds?: string[];
  presets?: ManagedSurfaceStylePreset[];
  unsafeForWrite?: boolean;
  users?: NewUserSurfaceStylePreset[];
}): SurfaceStylePresetCatalog {
  const systems = getSystemSurfaceStylePresets().map((preset, order) => ({
    ...preset,
    customized: false,
    enabled: true,
    order,
  }));
  const users = (args?.users ?? [])
    .toSorted((left, right) => left.order - right.order)
    .map((preset, index) => ({
      ...cloneSurfaceStylePreset(preset),
      customized: false as const,
      enabled: preset.enabled ?? true,
      order: systems.length + index,
    }));
  const presets = (args?.presets ?? [...systems, ...users]).map((preset) => ({
    ...cloneSurfaceStylePreset(preset),
    customized: preset.customized,
    enabled: preset.enabled,
    order: preset.order,
  }));
  const ids = new Set(presets.map((preset) => preset.id));
  const fallbackDefaultId = systems[0]!.id;
  const requestedDefault = args?.defaultPresetId;
  const defaultPresetId = presets.some((preset) => preset.id === requestedDefault && preset.enabled)
    ? requestedDefault!
    : fallbackDefaultId;
  return {
    catalogRevision: args?.catalogRevision ?? 0,
    favoriteIds: [...new Set(args?.favoriteIds ?? [])].filter((id) => ids.has(id)),
    defaultPresetId,
    presets: presets.toSorted((left, right) => left.order - right.order),
    systemCatalogRevision: SYSTEM_SURFACE_STYLE_CATALOG_REVISION,
    unsafeForWrite: args?.unsafeForWrite ?? false,
  };
}

export function addUserSurfaceStylePreset(
  catalog: SurfaceStylePresetCatalog,
  preset: SurfaceStylePreset
): SurfaceStylePresetCatalog | null {
  const users = catalog.presets.filter((item) => item.origin === 'user');
  const name = normalizeName(preset.name);
  const style = parseSurfaceStyle(preset.style);
  if (
    catalog.unsafeForWrite ||
    preset.origin !== 'user' ||
    !preset.id.trim() ||
    preset.id.length > 256 ||
    !name ||
    !style ||
    users.length >= SURFACE_STYLE_PRESET_MAX_USERS ||
    catalog.presets.some((item) => item.id === preset.id)
  )
    return null;
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.presets.push({
    ...preset,
    customized: false,
    enabled: true,
    name,
    style,
    order: Math.max(-1, ...next.presets.map((item) => item.order)) + 1,
  });
  next.presets = next.presets.map((item) =>
    item.id === preset.id ? { ...item, customized: false, enabled: true } : item
  );
  return next;
}

function isSystemSurfaceStylePresetCustomized(preset: ManagedSurfaceStylePreset): boolean {
  const canonical = getSystemSurfaceStylePresets().find((item) => item.id === preset.id);
  if (!canonical) return false;
  const canonicalOrder = getSystemSurfaceStylePresets().findIndex((item) => item.id === preset.id);
  return (
    preset.name !== canonical.name ||
    preset.enabled !== true ||
    preset.order !== canonicalOrder ||
    !areSurfaceStylesEqual(preset.style, canonical.style)
  );
}

export function updateSurfaceStylePresetValues(
  catalog: SurfaceStylePresetCatalog,
  id: string,
  patch: { name?: string; style?: SurfaceStylePreset['style'] }
): SurfaceStylePresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === id);
  const name = patch.name === undefined ? undefined : normalizeName(patch.name);
  const style = patch.style === undefined ? undefined : parseSurfaceStyle(patch.style);
  if (!current || name === null || style === null) return null;
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.presets = next.presets.map((preset) =>
    preset.id === id
      ? (() => {
          const updated = {
            ...preset,
            ...(name === undefined ? {} : { name }),
            ...(style === undefined ? {} : { style }),
          };
          return {
            ...updated,
            customized:
              updated.origin === 'system' ? isSystemSurfaceStylePresetCustomized(updated) : false,
          };
        })()
      : preset
  );
  return next;
}

export function deleteUserSurfaceStylePreset(
  catalog: SurfaceStylePresetCatalog,
  id: string
): SurfaceStylePresetCatalog | null {
  if (
    catalog.defaultPresetId === id ||
    !catalog.presets.some((preset) => preset.id === id && preset.origin === 'user')
  )
    return null;
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.presets = next.presets.filter((preset) => preset.id !== id);
  next.favoriteIds = next.favoriteIds.filter((favorite) => favorite !== id);
  return reorderSurfaceStylePresetCatalog(
    next,
    next.presets.map((preset) => preset.id)
  );
}

export function reorderSurfaceStylePresetCatalog(
  catalog: SurfaceStylePresetCatalog,
  ids: readonly string[]
): SurfaceStylePresetCatalog | null {
  if (
    ids.length !== catalog.presets.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !catalog.presets.some((preset) => preset.id === id))
  )
    return null;
  const rank = new Map(ids.map((id, index) => [id, index]));
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.presets = next.presets
    .toSorted((left, right) => rank.get(left.id)! - rank.get(right.id)!)
    .map((preset, order) => {
      const reordered = { ...preset, order };
      return {
        ...reordered,
        customized:
          reordered.origin === 'system' ? isSystemSurfaceStylePresetCustomized(reordered) : false,
      };
    });
  return next;
}

export function toggleSurfaceStylePresetEnabled(
  catalog: SurfaceStylePresetCatalog,
  id: string
): SurfaceStylePresetCatalog | null {
  const preset = catalog.presets.find((item) => item.id === id);
  if (!preset || catalog.defaultPresetId === id) return null;
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.presets = next.presets.map((item) => {
    if (item.id !== id) return item;
    const toggled = { ...item, enabled: !item.enabled };
    return {
      ...toggled,
      customized:
        toggled.origin === 'system' ? isSystemSurfaceStylePresetCustomized(toggled) : false,
    };
  });
  return next;
}

export function setDefaultSurfaceStylePreset(
  catalog: SurfaceStylePresetCatalog,
  id: string
): SurfaceStylePresetCatalog | null {
  if (!catalog.presets.some((preset) => preset.id === id && preset.enabled)) return null;
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.defaultPresetId = id;
  return next;
}

export function resetSystemSurfaceStylePreset(
  catalog: SurfaceStylePresetCatalog,
  id: string
): SurfaceStylePresetCatalog | null {
  const canonical = getSystemSurfaceStylePresets().find((preset) => preset.id === id);
  if (!canonical) return null;
  const canonicalOrder = getSystemSurfaceStylePresets().findIndex((preset) => preset.id === id);
  const next = cloneSurfaceStylePresetCatalog(catalog);
  const reordered = next.presets.filter((preset) => preset.id !== id);
  reordered.splice(canonicalOrder, 0, {
    ...cloneSurfaceStylePreset(canonical),
    customized: false,
    enabled: true,
    order: canonicalOrder,
  });
  next.presets = reordered.map((preset, order) => {
    const positioned = { ...preset, order };
    return {
      ...positioned,
      customized:
        positioned.origin === 'system' ? isSystemSurfaceStylePresetCustomized(positioned) : false,
    };
  });
  return next;
}

export function toggleSurfaceStylePresetFavorite(
  catalog: SurfaceStylePresetCatalog,
  id: string
): SurfaceStylePresetCatalog | null {
  if (!catalog.presets.some((preset) => preset.id === id)) return null;
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.favoriteIds = next.favoriteIds.includes(id)
    ? next.favoriteIds.filter((favorite) => favorite !== id)
    : [...next.favoriteIds, id];
  return next;
}
