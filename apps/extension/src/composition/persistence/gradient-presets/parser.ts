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

function parsePreset(value: unknown): StoredGradientPreset | null {
  if (
    !record(value) ||
    typeof value['id'] !== 'string' ||
    !value['id'].trim() ||
    value['id'].length > 256 ||
    typeof value['name'] !== 'string' ||
    !value['name'].trim() ||
    value['name'].trim().length > 80 ||
    !Number.isSafeInteger(value['order']) ||
    (value['origin'] !== 'system' && value['origin'] !== 'user')
  )
    return null;
  const paint = parsePaint({ kind: 'gradient', gradient: value['gradient'] });
  return paint?.kind === 'gradient'
    ? {
        id: value['id'],
        name: value['name'].trim().slice(0, 80),
        order: value['order'] as number,
        origin: value['origin'],
        gradient: paint.gradient,
      }
    : null;
}

export function parseGradientPresetCatalog(value: unknown): {
  catalog: GradientPresetCatalog;
  unsafeForWrite: boolean;
} {
  if (value === undefined)
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: false };
  if (!record(value) || !Number.isInteger(value['revision']) || !Array.isArray(value['presets']))
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
  if ((value['revision'] as number) > GRADIENT_PRESET_CATALOG_REVISION)
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
  const parsed = value['presets'].map(parsePreset);
  if (parsed.some((preset) => preset === null))
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
  const users = (parsed as StoredGradientPreset[]).filter((preset) => preset.origin === 'user');
  if (users.length > 100)
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
  const ids = new Set<string>(SYSTEM_GRADIENT_PRESETS.map((preset) => preset.id));
  if (users.some((preset) => ids.has(preset.id) || !ids.add(preset.id)))
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
  const favorites: Partial<Record<GradientPresetSurface, string[]>> = {};
  const rawFavorites = record(value['favoriteIdsBySurface']) ? value['favoriteIdsBySurface'] : {};
  for (const surface of GRADIENT_PRESET_SURFACES) {
    const raw = rawFavorites[surface];
    if (raw === undefined) continue;
    if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string'))
      return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
    favorites[surface] = Array.from(new Set(raw as string[])).filter((id) => ids.has(id));
  }
  const systems = SYSTEM_GRADIENT_PRESETS.map(cloneGradientPreset);
  return {
    catalog: {
      revision: GRADIENT_PRESET_CATALOG_REVISION,
      presets: [...systems, ...users].sort((a, b) => a.order - b.order),
      favoriteIdsBySurface: favorites,
    },
    unsafeForWrite: false,
  };
}
