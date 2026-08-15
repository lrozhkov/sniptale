import { parsePaint } from '@sniptale/foundation/paint';
import {
  GRADIENT_PRESET_CATALOG_REVISION,
  GRADIENT_PRESET_SURFACES,
  type GradientPresetCatalog,
  type GradientPresetSurface,
  type StoredGradientPreset,
} from './contracts';
import {
  cloneGradientPreset,
  createDefaultGradientPresetCatalog,
  SYSTEM_GRADIENT_PRESETS,
} from './defaults';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parsePreset(value: unknown, legacy: boolean): StoredGradientPreset | null {
  if (
    !record(value) ||
    typeof value['id'] !== 'string' ||
    !value['id'].trim() ||
    value['id'].length > 256 ||
    typeof value['name'] !== 'string' ||
    !value['name'].trim() ||
    value['name'].trim().length > 80 ||
    !Number.isSafeInteger(value['order']) ||
    (value['origin'] !== 'system' && value['origin'] !== 'user') ||
    (!legacy && (typeof value['enabled'] !== 'boolean' || typeof value['customized'] !== 'boolean'))
  )
    return null;
  const paint = parsePaint({ kind: 'gradient', gradient: value['gradient'] });
  return paint?.kind === 'gradient'
    ? {
        customized: legacy ? false : (value['customized'] as boolean),
        enabled: legacy ? true : (value['enabled'] as boolean),
        id: value['id'],
        name: value['name'].trim(),
        order: value['order'] as number,
        origin: value['origin'],
        gradient: paint.gradient,
      }
    : null;
}

function parseSurfaceMap<T>(args: {
  fallback: (surface: GradientPresetSurface) => T | undefined;
  raw: unknown;
  validate: (value: unknown, ids: ReadonlySet<string>) => T | undefined;
  ids: ReadonlySet<string>;
}): Partial<Record<GradientPresetSurface, T>> | null {
  const raw = record(args.raw) ? args.raw : {};
  const result: Partial<Record<GradientPresetSurface, T>> = {};
  for (const surface of GRADIENT_PRESET_SURFACES) {
    const value = raw[surface] === undefined ? args.fallback(surface) : raw[surface];
    if (value === undefined) continue;
    const parsed = args.validate(value, args.ids);
    if (parsed === undefined) return null;
    result[surface] = parsed;
  }
  return result;
}

function parseFavoriteIdsBySurface(
  value: unknown,
  ids: ReadonlySet<string>
): Partial<Record<GradientPresetSurface, string[]>> | null {
  return parseSurfaceMap<string[]>({
    fallback: () => undefined,
    ids,
    raw: value,
    validate: (raw, knownIds) =>
      Array.isArray(raw) && raw.every((id) => typeof id === 'string')
        ? [...new Set(raw as string[])].filter((id) => knownIds.has(id))
        : undefined,
  });
}

function normalizeLegacyCatalog(value: Record<string, unknown>): GradientPresetCatalog | null {
  if (
    !Array.isArray(value['presets']) ||
    (value['favoriteIdsBySurface'] !== undefined && !record(value['favoriteIdsBySurface']))
  )
    return null;
  const parsed = value['presets'].map((preset) => parsePreset(preset, true));
  if (parsed.some((preset) => preset === null)) return null;
  const users = (parsed as StoredGradientPreset[]).filter((preset) => preset.origin === 'user');
  const systems = SYSTEM_GRADIENT_PRESETS.map(cloneGradientPreset);
  const presets = [...systems, ...users].map((preset, order) => ({ ...preset, order }));
  const ids = new Set(presets.map((preset) => preset.id));
  if (ids.size !== presets.length || users.length > 100) return null;
  const favoriteIdsBySurface = parseFavoriteIdsBySurface(value['favoriteIdsBySurface'], ids);
  if (!favoriteIdsBySurface) return null;
  return {
    defaultPresetIdBySurface: {
      'highlighter-frame-fill': systems[0]!.id,
    },
    favoriteIdsBySurface,
    presets,
    revision: GRADIENT_PRESET_CATALOG_REVISION,
  };
}

function isSystemCustomizationValid(preset: StoredGradientPreset): boolean {
  const canonical = SYSTEM_GRADIENT_PRESETS.find((item) => item.id === preset.id);
  if (!canonical) return false;
  const canonicalPaint = parsePaint({ kind: 'gradient', gradient: canonical.gradient });
  if (canonicalPaint?.kind !== 'gradient') return false;
  const customized =
    preset.name !== canonical.name ||
    preset.enabled !== canonical.enabled ||
    preset.order !== canonical.order ||
    JSON.stringify(preset.gradient) !== JSON.stringify(canonicalPaint.gradient);
  return preset.customized === customized;
}

function parseCurrentCatalog(value: Record<string, unknown>): GradientPresetCatalog | null {
  if (!Array.isArray(value['presets']) || !record(value['favoriteIdsBySurface'])) return null;
  const parsed = value['presets'].map((preset) => parsePreset(preset, false));
  if (parsed.some((preset) => preset === null)) return null;
  const presets = parsed as StoredGradientPreset[];
  const ids = new Set(presets.map((preset) => preset.id));
  const systemIds = new Set(SYSTEM_GRADIENT_PRESETS.map((preset) => preset.id));
  const systems = presets.filter((preset) => preset.origin === 'system');
  const ordered = presets.toSorted((left, right) => left.order - right.order);
  if (
    ids.size !== presets.length ||
    ordered.some((preset, order) => preset.order !== order) ||
    systems.length !== systemIds.size ||
    systems.some((preset) => !systemIds.has(preset.id) || !isSystemCustomizationValid(preset)) ||
    presets.some((preset) => preset.origin === 'user' && preset.customized) ||
    presets.filter((preset) => preset.origin === 'user').length > 100
  )
    return null;
  const favoriteIdsBySurface = parseFavoriteIdsBySurface(value['favoriteIdsBySurface'], ids);
  const defaultPresetIdBySurface = parseSurfaceMap<string>({
    fallback: () => undefined,
    ids,
    raw: value['defaultPresetIdBySurface'],
    validate: (raw, knownIds) =>
      typeof raw === 'string' &&
      knownIds.has(raw) &&
      presets.find((item) => item.id === raw)?.enabled
        ? raw
        : undefined,
  });
  if (
    !favoriteIdsBySurface ||
    !defaultPresetIdBySurface ||
    defaultPresetIdBySurface['highlighter-frame-fill'] === undefined
  )
    return null;
  return {
    defaultPresetIdBySurface,
    favoriteIdsBySurface,
    presets: ordered,
    revision: GRADIENT_PRESET_CATALOG_REVISION,
  };
}

export function parseGradientPresetCatalog(value: unknown): {
  catalog: GradientPresetCatalog;
  unsafeForWrite: boolean;
} {
  if (value === undefined)
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: false };
  if (!record(value) || !Number.isInteger(value['revision']))
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
  const revision = value['revision'] as number;
  if (revision !== 0 && revision !== 1 && revision !== GRADIENT_PRESET_CATALOG_REVISION)
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
  const catalog =
    revision < GRADIENT_PRESET_CATALOG_REVISION
      ? normalizeLegacyCatalog(value)
      : parseCurrentCatalog(value);
  return catalog
    ? { catalog, unsafeForWrite: false }
    : { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
}
