import {
  areSurfaceStylesEqual,
  parseSurfaceStyle,
} from '../../../features/highlighter/surface-style/style';
import {
  getSystemSurfaceStylePresets,
  SYSTEM_SURFACE_STYLE_CATALOG_REVISION,
} from '../../../features/highlighter/surface-style/system-presets';
import { createSurfaceStylePresetCatalog } from './catalog';
import {
  SURFACE_STYLE_PRESET_MAX_BYTES,
  SURFACE_STYLE_PRESET_MAX_USERS,
  SURFACE_STYLE_PRESET_SCHEMA_VERSION,
  SURFACE_STYLE_PRESET_STORAGE_KEY,
  SURFACE_STYLE_PRESET_SURFACE,
  type ManagedSurfaceStylePreset,
  type StoredSurfaceStylePresetState,
} from './contracts';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parsePreset(value: unknown, legacy = false): ManagedSurfaceStylePreset | null {
  if (
    !record(value) ||
    (value['origin'] !== 'system' && value['origin'] !== 'user') ||
    typeof value['id'] !== 'string' ||
    !value['id'].trim() ||
    value['id'].length > 256 ||
    typeof value['name'] !== 'string' ||
    !value['name'].trim() ||
    value['name'].trim().length > 80 ||
    !Number.isSafeInteger(value['order']) ||
    (!legacy && (typeof value['enabled'] !== 'boolean' || typeof value['customized'] !== 'boolean'))
  )
    return null;
  const style = parseSurfaceStyle(value['style']);
  return style
    ? {
        customized: legacy ? false : (value['customized'] as boolean),
        enabled: legacy ? true : (value['enabled'] as boolean),
        id: value['id'],
        name: value['name'].trim(),
        order: value['order'] as number,
        origin: value['origin'],
        style,
      }
    : null;
}

function systemPresets(): ManagedSurfaceStylePreset[] {
  return getSystemSurfaceStylePresets().map((preset, order) => ({
    ...preset,
    customized: false,
    enabled: true,
    order,
  }));
}

function parseFavoriteIds(value: unknown, ids: ReadonlySet<string>): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) return null;
  return [...new Set(value as string[])].filter((id) => ids.has(id));
}

function isSystemCustomizationValid(preset: ManagedSurfaceStylePreset): boolean {
  const systems = systemPresets();
  const canonical = systems.find((item) => item.id === preset.id);
  if (!canonical) return false;
  const customized =
    preset.name !== canonical.name ||
    preset.enabled !== canonical.enabled ||
    preset.order !== canonical.order ||
    !areSurfaceStylesEqual(preset.style, canonical.style);
  return preset.customized === customized;
}

function parseLegacyState(value: Record<string, unknown>) {
  if (!Array.isArray(value['userPresets']) || !record(value['favoriteIdsBySurface'])) return null;
  const users = value['userPresets'].map((preset) => parsePreset(preset, true));
  if (users.some((preset) => preset === null || preset.origin !== 'user')) return null;
  const systems = systemPresets();
  const presets = [...systems, ...(users as ManagedSurfaceStylePreset[])].map((preset, order) => ({
    ...preset,
    order,
  }));
  const ids = new Set(presets.map((preset) => preset.id));
  if (ids.size !== presets.length || users.length > SURFACE_STYLE_PRESET_MAX_USERS) return null;
  const rawFavorites = value['favoriteIdsBySurface'][SURFACE_STYLE_PRESET_SURFACE];
  const favoriteIds = parseFavoriteIds(rawFavorites, ids);
  if (!favoriteIds) return null;
  return createSurfaceStylePresetCatalog({
    catalogRevision: value['catalogRevision'] as number,
    defaultPresetId: systems[0]!.id,
    favoriteIds,
    presets,
  });
}

function parseCurrentState(value: Record<string, unknown>) {
  if (
    !Array.isArray(value['presets']) ||
    !record(value['defaultPresetIdBySurface']) ||
    !record(value['favoriteIdsBySurface'])
  )
    return null;
  const parsed = value['presets'].map((preset) => parsePreset(preset));
  if (parsed.some((preset) => preset === null)) return null;
  const presets = parsed as ManagedSurfaceStylePreset[];
  const ids = new Set(presets.map((preset) => preset.id));
  const canonicalSystemIds = new Set(systemPresets().map((preset) => preset.id));
  const systems = presets.filter((preset) => preset.origin === 'system');
  const ordered = presets.toSorted((left, right) => left.order - right.order);
  const defaultPresetId = value['defaultPresetIdBySurface'][SURFACE_STYLE_PRESET_SURFACE];
  if (
    ids.size !== presets.length ||
    ordered.some((preset, order) => preset.order !== order) ||
    systems.length !== canonicalSystemIds.size ||
    systems.some(
      (preset) => !canonicalSystemIds.has(preset.id) || !isSystemCustomizationValid(preset)
    ) ||
    presets.some((preset) => preset.origin === 'user' && preset.customized) ||
    presets.filter((preset) => preset.origin === 'user').length > SURFACE_STYLE_PRESET_MAX_USERS ||
    typeof defaultPresetId !== 'string' ||
    !presets.some((preset) => preset.id === defaultPresetId && preset.enabled)
  )
    return null;
  const rawFavorites = value['favoriteIdsBySurface'][SURFACE_STYLE_PRESET_SURFACE];
  const favoriteIds = parseFavoriteIds(rawFavorites, ids);
  if (!favoriteIds) return null;
  return createSurfaceStylePresetCatalog({
    catalogRevision: value['catalogRevision'] as number,
    defaultPresetId,
    favoriteIds,
    presets,
  });
}

const PREVIOUS_SYSTEM_SURFACE_IDS = new Set([
  'system-surface-plain',
  'system-surface-frosted-light',
  'system-surface-frosted-dark',
  'system-surface-clear-tint',
  'system-surface-soft-elevated',
]);

function parsePreviousSystemState(value: Record<string, unknown>) {
  if (
    !Array.isArray(value['presets']) ||
    !record(value['defaultPresetIdBySurface']) ||
    !record(value['favoriteIdsBySurface'])
  )
    return null;
  const parsed = value['presets'].map((preset) => parsePreset(preset));
  if (parsed.some((preset) => preset === null)) return null;
  const previous = (parsed as ManagedSurfaceStylePreset[]).toSorted(
    (left, right) => left.order - right.order
  );
  const previousIds = new Set(previous.map((preset) => preset.id));
  const previousSystemIds = new Set(
    previous.filter((preset) => preset.origin === 'system').map((preset) => preset.id)
  );
  if (
    previousIds.size !== previous.length ||
    previousSystemIds.size !== PREVIOUS_SYSTEM_SURFACE_IDS.size ||
    [...PREVIOUS_SYSTEM_SURFACE_IDS].some((id) => !previousSystemIds.has(id)) ||
    previous.some((preset, order) => preset.order !== order) ||
    previous.some(
      (preset) =>
        (preset.origin === 'system' && !PREVIOUS_SYSTEM_SURFACE_IDS.has(preset.id)) ||
        (preset.origin === 'user' && preset.customized)
    ) ||
    previous.filter((preset) => preset.origin === 'user').length > SURFACE_STYLE_PRESET_MAX_USERS
  )
    return null;

  const customizedIds = new Set(
    previous
      .filter((preset) => preset.origin === 'system' && preset.customized)
      .map((preset) => preset.id)
  );
  const refreshed = systemPresets().filter((preset) => !customizedIds.has(preset.id));
  let pending: ManagedSurfaceStylePreset[] = [];
  let sawAnchor = false;
  for (const preset of previous) {
    if (preset.origin === 'user' || (preset.customized && customizedIds.has(preset.id))) {
      pending.push(preset);
      continue;
    }
    const anchor = refreshed.findIndex((candidate) => candidate.id === preset.id);
    if (anchor >= 0 && pending.length > 0) {
      refreshed.splice(sawAnchor ? anchor : 0, 0, ...pending);
      pending = [];
    }
    if (anchor >= 0) sawAnchor = true;
  }
  refreshed.push(...pending);
  const canonicalById = new Map(systemPresets().map((preset) => [preset.id, preset]));
  const presets = refreshed.map((preset, order) => {
    const positioned = { ...preset, order };
    if (positioned.origin === 'user') return { ...positioned, customized: false };
    const canonical = canonicalById.get(positioned.id)!;
    return {
      ...positioned,
      customized:
        positioned.name !== canonical.name ||
        positioned.enabled !== canonical.enabled ||
        positioned.order !== canonical.order ||
        !areSurfaceStylesEqual(positioned.style, canonical.style),
    };
  });
  const ids = new Set(presets.map((preset) => preset.id));
  if (ids.size !== presets.length) return null;
  const defaultPresetId = value['defaultPresetIdBySurface'][SURFACE_STYLE_PRESET_SURFACE];
  if (
    typeof defaultPresetId !== 'string' ||
    !presets.some((preset) => preset.id === defaultPresetId && preset.enabled)
  )
    return null;
  const rawFavorites = value['favoriteIdsBySurface'][SURFACE_STYLE_PRESET_SURFACE];
  const favoriteIds = parseFavoriteIds(rawFavorites, ids);
  if (!favoriteIds) return null;
  return createSurfaceStylePresetCatalog({
    catalogRevision: value['catalogRevision'] as number,
    defaultPresetId,
    favoriteIds,
    presets,
  });
}

export function parseStoredSurfaceStylePresetState(value: unknown) {
  if (value === undefined) return { catalog: createSurfaceStylePresetCatalog(), stored: null };
  const unsafe = () => ({
    catalog: createSurfaceStylePresetCatalog({ unsafeForWrite: true }),
    stored: null,
  });
  if (
    new TextEncoder().encode(JSON.stringify({ [SURFACE_STYLE_PRESET_STORAGE_KEY]: value }))
      .byteLength > SURFACE_STYLE_PRESET_MAX_BYTES ||
    !record(value) ||
    !Number.isSafeInteger(value['catalogRevision']) ||
    (value['catalogRevision'] as number) < 0 ||
    (value['systemCatalogRevision'] !== 1 &&
      value['systemCatalogRevision'] !== SYSTEM_SURFACE_STYLE_CATALOG_REVISION) ||
    (value['schemaVersion'] !== 1 && value['schemaVersion'] !== SURFACE_STYLE_PRESET_SCHEMA_VERSION)
  )
    return unsafe();
  const catalog =
    value['schemaVersion'] === 1
      ? parseLegacyState(value)
      : value['systemCatalogRevision'] === 1
        ? parsePreviousSystemState(value)
        : parseCurrentState(value);
  return catalog ? { catalog, stored: serializeSurfaceStylePresetCatalog(catalog) } : unsafe();
}

export function serializeSurfaceStylePresetCatalog(
  catalog: ReturnType<typeof createSurfaceStylePresetCatalog>
): StoredSurfaceStylePresetState {
  return {
    catalogRevision: catalog.catalogRevision,
    defaultPresetIdBySurface: {
      [SURFACE_STYLE_PRESET_SURFACE]: catalog.defaultPresetId,
    },
    favoriteIdsBySurface: { [SURFACE_STYLE_PRESET_SURFACE]: [...catalog.favoriteIds] },
    presets: catalog.presets.map((preset) => ({
      ...preset,
      style: { ...preset.style, fillPaint: structuredClone(preset.style.fillPaint) },
    })),
    schemaVersion: SURFACE_STYLE_PRESET_SCHEMA_VERSION,
    systemCatalogRevision: SYSTEM_SURFACE_STYLE_CATALOG_REVISION,
  };
}
