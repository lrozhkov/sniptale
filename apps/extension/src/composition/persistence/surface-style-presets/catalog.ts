import type { SurfaceStylePreset } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { cloneSurfaceStylePreset } from '../../../features/highlighter/surface-style/operations';
import {
  getSystemSurfaceStylePresets,
  SYSTEM_SURFACE_STYLE_CATALOG_REVISION,
} from '../../../features/highlighter/surface-style/system-presets';
import { parseSurfaceStyle } from '../../../features/highlighter/surface-style/style';
import {
  SURFACE_STYLE_PRESET_MAX_USERS,
  type StoredUserSurfaceStylePreset,
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
      order: preset.order,
    })),
  };
}

export function createSurfaceStylePresetCatalog(args?: {
  catalogRevision?: number;
  favoriteIds?: string[];
  unsafeForWrite?: boolean;
  users?: StoredUserSurfaceStylePreset[];
}): SurfaceStylePresetCatalog {
  const systems = getSystemSurfaceStylePresets().map((preset, order) => ({ ...preset, order }));
  const users = (args?.users ?? []).map((preset) => ({
    ...cloneSurfaceStylePreset(preset),
    order: preset.order,
  }));
  const ids = new Set([...systems, ...users].map((preset) => preset.id));
  return {
    catalogRevision: args?.catalogRevision ?? 0,
    favoriteIds: [...new Set(args?.favoriteIds ?? [])].filter((id) => ids.has(id)),
    presets: [...systems, ...users.toSorted((left, right) => left.order - right.order)],
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
  next.presets.push({ ...preset, name, style, order: users.length });
  return next;
}

export function updateUserSurfaceStylePreset(
  catalog: SurfaceStylePresetCatalog,
  id: string,
  patch: { name?: string; style?: SurfaceStylePreset['style'] }
): SurfaceStylePresetCatalog | null {
  const current = catalog.presets.find((preset) => preset.id === id);
  const name = patch.name === undefined ? undefined : normalizeName(patch.name);
  const style = patch.style === undefined ? undefined : parseSurfaceStyle(patch.style);
  if (!current || current.origin !== 'user' || name === null || style === null) return null;
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.presets = next.presets.map((preset) =>
    preset.id === id
      ? {
          ...preset,
          ...(name === undefined ? {} : { name }),
          ...(style === undefined ? {} : { style }),
        }
      : preset
  );
  return next;
}

export function deleteUserSurfaceStylePreset(
  catalog: SurfaceStylePresetCatalog,
  id: string
): SurfaceStylePresetCatalog | null {
  if (!catalog.presets.some((preset) => preset.id === id && preset.origin === 'user')) return null;
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.presets = next.presets.filter((preset) => preset.id !== id);
  next.favoriteIds = next.favoriteIds.filter((favorite) => favorite !== id);
  return reorderUserSurfaceStylePresets(
    next,
    next.presets.filter((preset) => preset.origin === 'user').map((preset) => preset.id)
  );
}

export function reorderUserSurfaceStylePresets(
  catalog: SurfaceStylePresetCatalog,
  ids: readonly string[]
): SurfaceStylePresetCatalog | null {
  const users = catalog.presets.filter((preset) => preset.origin === 'user');
  if (
    ids.length !== users.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !users.some((preset) => preset.id === id))
  )
    return null;
  const rank = new Map(ids.map((id, index) => [id, index]));
  const next = cloneSurfaceStylePresetCatalog(catalog);
  next.presets = [
    ...next.presets.filter((preset) => preset.origin === 'system'),
    ...next.presets
      .filter((preset) => preset.origin === 'user')
      .toSorted((left, right) => rank.get(left.id)! - rank.get(right.id)!)
      .map((preset, order) => ({ ...preset, order })),
  ];
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
