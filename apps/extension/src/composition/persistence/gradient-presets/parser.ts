import { parsePaint } from '@sniptale/foundation/paint';
import { hasUniqueSequentialPresetOrder, restoreManagedPresetOrder } from '../managed-preset-order';
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
  const remapped = remapUserSystemCollisions(users);
  const systems = SYSTEM_GRADIENT_PRESETS.map(cloneGradientPreset);
  const presets = [...systems, ...remapped.previous].map((preset, order) => ({ ...preset, order }));
  const ids = new Set(presets.map((preset) => preset.id));
  if (ids.size !== presets.length || users.length > 100) return null;
  const originalIds = new Set([
    ...systems.map((preset) => preset.id),
    ...users.map((preset) => preset.id),
  ]);
  const favoriteIdsBySurface = parseFavoriteIdsBySurface(
    value['favoriteIdsBySurface'],
    originalIds
  );
  if (!favoriteIdsBySurface) return null;
  return parseCurrentCatalog({
    defaultPresetIdBySurface: {
      'highlighter-frame-fill': systems[0]!.id,
    },
    favoriteIdsBySurface: remapFavoriteIds(favoriteIdsBySurface, remapped.remapped),
    presets,
    revision: GRADIENT_PRESET_CATALOG_REVISION,
  });
}

const PREVIOUS_SYSTEM_GRADIENT_IDS = new Set([
  'system-sunset',
  'system-ocean',
  'system-aurora',
  'system-radial-glow',
  'system-conic-spectrum',
]);

function refreshPreviousCatalog(value: Record<string, unknown>): GradientPresetCatalog | null {
  if (
    !Array.isArray(value['presets']) ||
    !record(value['defaultPresetIdBySurface']) ||
    !record(value['favoriteIdsBySurface'])
  )
    return null;
  const parsed = value['presets'].map((preset) => parsePreset(preset, false));
  if (parsed.some((preset) => preset === null)) return null;
  const previous = (parsed as StoredGradientPreset[]).toSorted(
    (left, right) => left.order - right.order
  );
  const ids = new Set(previous.map((preset) => preset.id));
  const previousSystemIds = new Set(
    previous.filter((preset) => preset.origin === 'system').map((preset) => preset.id)
  );
  if (
    ids.size !== previous.length ||
    previousSystemIds.size !== PREVIOUS_SYSTEM_GRADIENT_IDS.size ||
    [...PREVIOUS_SYSTEM_GRADIENT_IDS].some((id) => !previousSystemIds.has(id)) ||
    previous.some((preset, order) => preset.order !== order) ||
    previous.some(
      (preset) =>
        (preset.origin === 'system' && !PREVIOUS_SYSTEM_GRADIENT_IDS.has(preset.id)) ||
        (preset.origin === 'user' && preset.customized)
    ) ||
    previous.filter((preset) => preset.origin === 'user').length > 100
  )
    return null;

  const customizedIds = new Set(
    previous
      .filter((preset) => preset.origin === 'system' && preset.customized)
      .map((preset) => preset.id)
  );
  const remapped = remapUserSystemCollisions(previous);
  const refreshed = restoreManagedPresetOrder({
    copyPending: cloneGradientPreset,
    customizedIds,
    previous: remapped.previous,
    refreshed: SYSTEM_GRADIENT_PRESETS.filter((preset) => !customizedIds.has(preset.id)).map(
      cloneGradientPreset
    ),
  });
  const presets = refreshed.map((preset, order) => {
    const positioned = { ...preset, order };
    if (positioned.origin === 'user') return { ...positioned, customized: false };
    const canonical = SYSTEM_GRADIENT_PRESETS.find((item) => item.id === positioned.id)!;
    return {
      ...positioned,
      customized:
        positioned.name !== canonical.name ||
        positioned.enabled !== canonical.enabled ||
        positioned.order !== canonical.order ||
        JSON.stringify(positioned.gradient) !== JSON.stringify(canonical.gradient),
    };
  });
  const currentIds = new Set(presets.map((preset) => preset.id));
  if (currentIds.size !== presets.length) return null;
  const favoriteIdsBySurface = parseFavoriteIdsBySurface(value['favoriteIdsBySurface'], ids);
  const requestedDefault = value['defaultPresetIdBySurface']['highlighter-frame-fill'];
  if (
    !favoriteIdsBySurface ||
    typeof requestedDefault !== 'string' ||
    !previous.some((preset) => preset.id === requestedDefault && preset.enabled)
  )
    return null;
  return parseCurrentCatalog({
    defaultPresetIdBySurface: {
      'highlighter-frame-fill': remapped.remapped.get(requestedDefault) ?? requestedDefault,
    },
    favoriteIdsBySurface: remapFavoriteIds(favoriteIdsBySurface, remapped.remapped),
    presets,
    revision: GRADIENT_PRESET_CATALOG_REVISION,
  });
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

const REVISION_THREE_SYSTEM_IDS = new Set(
  SYSTEM_GRADIENT_PRESETS.map((preset) => preset.id).filter(
    (id) => id !== 'system-dusk' && id !== 'system-sand'
  )
);

function isRevisionThreeCustomizationValid(preset: StoredGradientPreset): boolean {
  const canonical = SYSTEM_GRADIENT_PRESETS.filter((item) =>
    REVISION_THREE_SYSTEM_IDS.has(item.id)
  ).findIndex((item) => item.id === preset.id);
  if (canonical < 0) return false;
  const baseline = SYSTEM_GRADIENT_PRESETS.find((item) => item.id === preset.id)!;
  const normalized = parsePaint({ kind: 'gradient', gradient: baseline.gradient });
  if (normalized?.kind !== 'gradient') return false;
  return (
    preset.customized ===
    (preset.name !== baseline.name ||
      preset.enabled !== baseline.enabled ||
      preset.order !== canonical ||
      JSON.stringify(preset.gradient) !== JSON.stringify(normalized.gradient))
  );
}

function remapUserSystemCollisions(previous: StoredGradientPreset[]) {
  const reserved = new Set(SYSTEM_GRADIENT_PRESETS.map((item) => item.id));
  const occupied = new Set([...reserved, ...previous.map((item) => item.id)]);
  const remapped = new Map<string, string>();
  for (const preset of previous) {
    if (preset.origin !== 'user' || !reserved.has(preset.id)) continue;
    let suffix = 1;
    let candidate = `user-migrated-${preset.id}`;
    while (occupied.has(candidate)) candidate = `user-migrated-${preset.id}-${suffix++}`;
    remapped.set(preset.id, candidate);
    occupied.add(candidate);
  }
  return {
    previous: previous.map((item) => ({
      ...item,
      id: item.origin === 'user' ? (remapped.get(item.id) ?? item.id) : item.id,
    })),
    remapped,
  };
}

function remapFavoriteIds(
  favorites: Partial<Record<GradientPresetSurface, string[]>>,
  remapped: ReadonlyMap<string, string>
): Partial<Record<GradientPresetSurface, string[]>> {
  return Object.fromEntries(
    Object.entries(favorites).map(([surface, ids]) => [
      surface,
      ids?.map((id) => remapped.get(id) ?? id),
    ])
  );
}

function refreshRevisionThreeCatalog(value: Record<string, unknown>): GradientPresetCatalog | null {
  if (
    !Array.isArray(value['presets']) ||
    !record(value['favoriteIdsBySurface']) ||
    !record(value['defaultPresetIdBySurface'])
  )
    return null;
  const parsed = value['presets'].map((item) => parsePreset(item, false));
  if (parsed.some((item) => item === null)) return null;
  const previous = parsed as StoredGradientPreset[];
  const oldSystems = previous.filter((item) => item.origin === 'system');
  if (
    !hasUniqueSequentialPresetOrder(previous) ||
    oldSystems.length !== REVISION_THREE_SYSTEM_IDS.size ||
    oldSystems.some((item) => !REVISION_THREE_SYSTEM_IDS.has(item.id)) ||
    oldSystems.some((item) => !isRevisionThreeCustomizationValid(item)) ||
    previous.filter((item) => item.origin === 'user').length > 100 ||
    previous.some((item) => item.origin === 'user' && item.customized)
  )
    return null;
  const ids = new Set(previous.map((item) => item.id));
  if (ids.size !== previous.length) return null;
  const favoriteIdsBySurface = parseFavoriteIdsBySurface(value['favoriteIdsBySurface'], ids);
  const requestedDefault = value['defaultPresetIdBySurface']['highlighter-frame-fill'];
  if (
    !favoriteIdsBySurface ||
    typeof requestedDefault !== 'string' ||
    !previous.some((item) => item.id === requestedDefault && item.enabled)
  )
    return null;
  const remapped = remapUserSystemCollisions(previous);
  const customizedIds = new Set(
    oldSystems.filter((item) => item.customized).map((item) => item.id)
  );
  const refreshed = restoreManagedPresetOrder({
    copyPending: cloneGradientPreset,
    customizedIds,
    previous: remapped.previous.toSorted((left, right) => left.order - right.order),
    refreshed: SYSTEM_GRADIENT_PRESETS.filter((item) => !customizedIds.has(item.id)).map(
      cloneGradientPreset
    ),
  });
  const presets = refreshed.map((item, order) => {
    const positioned = { ...item, order };
    if (positioned.origin === 'user') return positioned;
    const canonical = SYSTEM_GRADIENT_PRESETS.find((preset) => preset.id === positioned.id)!;
    return {
      ...positioned,
      customized:
        positioned.name !== canonical.name ||
        positioned.enabled !== canonical.enabled ||
        positioned.order !== canonical.order ||
        JSON.stringify(positioned.gradient) !== JSON.stringify(canonical.gradient),
    };
  });
  const catalog = {
    revision: GRADIENT_PRESET_CATALOG_REVISION,
    presets,
    favoriteIdsBySurface: remapFavoriteIds(favoriteIdsBySurface, remapped.remapped),
    defaultPresetIdBySurface: {
      'highlighter-frame-fill': remapped.remapped.get(requestedDefault) ?? requestedDefault,
    },
  };
  return parseCurrentCatalog(catalog);
}

function parseCurrentCatalog(value: Record<string, unknown>): GradientPresetCatalog | null {
  if (!Array.isArray(value['presets']) || !record(value['favoriteIdsBySurface'])) return null;
  const parsed = value['presets'].map((preset) => parsePreset(preset, false));
  if (parsed.some((preset) => preset === null)) return null;
  const presets = parsed as StoredGradientPreset[];
  const systemIds = new Set(SYSTEM_GRADIENT_PRESETS.map((preset) => preset.id));
  const systems = presets.filter((preset) => preset.origin === 'system');
  const ordered = presets.toSorted((left, right) => left.order - right.order);
  if (
    !hasUniqueSequentialPresetOrder(presets) ||
    systems.length !== systemIds.size ||
    systems.some((preset) => !systemIds.has(preset.id) || !isSystemCustomizationValid(preset)) ||
    presets.some((preset) => preset.origin === 'user' && preset.customized) ||
    presets.filter((preset) => preset.origin === 'user').length > 100
  )
    return null;
  const ids = new Set(presets.map((preset) => preset.id));
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
  if (
    revision !== 0 &&
    revision !== 1 &&
    revision !== 2 &&
    revision !== 3 &&
    revision !== GRADIENT_PRESET_CATALOG_REVISION
  )
    return { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
  const catalog =
    revision === 2
      ? refreshPreviousCatalog(value)
      : revision === 3
        ? refreshRevisionThreeCatalog(value)
        : revision < GRADIENT_PRESET_CATALOG_REVISION
          ? normalizeLegacyCatalog(value)
          : parseCurrentCatalog(value);
  return catalog
    ? { catalog, unsafeForWrite: false }
    : { catalog: createDefaultGradientPresetCatalog(), unsafeForWrite: true };
}
