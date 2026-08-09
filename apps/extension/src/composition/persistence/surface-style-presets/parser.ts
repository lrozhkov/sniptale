import type { SurfaceStylePreset } from '@sniptale/runtime-contracts/highlighter/surface-style';
import { parseSurfaceStyle } from '../../../features/highlighter/surface-style/style';
import {
  getSystemSurfaceStylePresets,
  SYSTEM_SURFACE_STYLE_CATALOG_REVISION,
} from '../../../features/highlighter/surface-style/system-presets';
import { createSurfaceStylePresetCatalog } from './catalog';
import {
  SURFACE_STYLE_PRESET_MAX_USERS,
  SURFACE_STYLE_PRESET_MAX_BYTES,
  SURFACE_STYLE_PRESET_SCHEMA_VERSION,
  SURFACE_STYLE_PRESET_STORAGE_KEY,
  SURFACE_STYLE_PRESET_SURFACE,
  type StoredSurfaceStylePresetState,
  type StoredUserSurfaceStylePreset,
} from './contracts';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseUserPreset(value: unknown): StoredUserSurfaceStylePreset | null {
  if (
    !record(value) ||
    value['origin'] !== 'user' ||
    typeof value['id'] !== 'string' ||
    !value['id'].trim() ||
    value['id'].length > 256 ||
    typeof value['name'] !== 'string' ||
    !value['name'].trim() ||
    value['name'].trim().length > 80 ||
    !Number.isSafeInteger(value['order'])
  )
    return null;
  const style = parseSurfaceStyle(value['style']);
  return style
    ? {
        id: value['id'],
        name: value['name'].trim(),
        order: value['order'] as number,
        origin: 'user',
        style,
      }
    : null;
}

export function parseStoredSurfaceStylePresetState(value: unknown) {
  if (value === undefined) return { catalog: createSurfaceStylePresetCatalog(), stored: null };
  const unsafe = () => ({
    catalog: createSurfaceStylePresetCatalog({ unsafeForWrite: true }),
    stored: null,
  });
  if (
    new TextEncoder().encode(JSON.stringify({ [SURFACE_STYLE_PRESET_STORAGE_KEY]: value }))
      .byteLength > SURFACE_STYLE_PRESET_MAX_BYTES
  )
    return unsafe();
  if (
    !record(value) ||
    value['schemaVersion'] !== SURFACE_STYLE_PRESET_SCHEMA_VERSION ||
    value['systemCatalogRevision'] !== SYSTEM_SURFACE_STYLE_CATALOG_REVISION ||
    !Number.isSafeInteger(value['catalogRevision']) ||
    (value['catalogRevision'] as number) < 0 ||
    !Array.isArray(value['userPresets']) ||
    !record(value['favoriteIdsBySurface'])
  )
    return unsafe();
  const users = value['userPresets'].map(parseUserPreset);
  if (users.length > SURFACE_STYLE_PRESET_MAX_USERS || users.some((preset) => preset === null))
    return unsafe();
  const systemIds = new Set(getSystemSurfaceStylePresets().map((preset) => preset.id));
  const ids = new Set(systemIds);
  if (
    (users as StoredUserSurfaceStylePreset[]).some(
      (preset) => ids.has(preset.id) || !ids.add(preset.id)
    )
  )
    return unsafe();
  const rawFavorites = (value['favoriteIdsBySurface'] as Record<string, unknown>)[
    SURFACE_STYLE_PRESET_SURFACE
  ];
  if (
    rawFavorites !== undefined &&
    (!Array.isArray(rawFavorites) || rawFavorites.some((id) => typeof id !== 'string'))
  )
    return unsafe();
  const favoriteIds = [...new Set((rawFavorites ?? []) as string[])].filter((id) => ids.has(id));
  const stored: StoredSurfaceStylePresetState = {
    catalogRevision: value['catalogRevision'] as number,
    favoriteIdsBySurface: { [SURFACE_STYLE_PRESET_SURFACE]: favoriteIds },
    schemaVersion: 1,
    systemCatalogRevision: 1,
    userPresets: users as StoredUserSurfaceStylePreset[],
  };
  return {
    catalog: createSurfaceStylePresetCatalog({
      catalogRevision: stored.catalogRevision,
      favoriteIds,
      users: stored.userPresets,
    }),
    stored,
  };
}

export function serializeSurfaceStylePresetCatalog(
  catalog: ReturnType<typeof createSurfaceStylePresetCatalog>
): StoredSurfaceStylePresetState {
  return {
    catalogRevision: catalog.catalogRevision,
    favoriteIdsBySurface: { [SURFACE_STYLE_PRESET_SURFACE]: [...catalog.favoriteIds] },
    schemaVersion: 1,
    systemCatalogRevision: 1,
    userPresets: catalog.presets
      .filter(
        (preset): preset is SurfaceStylePreset & { origin: 'user'; order: number } =>
          preset.origin === 'user'
      )
      .map((preset) => ({
        ...preset,
        style: { ...preset.style, fillPaint: structuredClone(preset.style.fillPaint) },
      })),
  };
}
